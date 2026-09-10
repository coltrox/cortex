import type { Db } from './db'
import type { NoteRow } from '../../shared/types'

const NOTE_COLS = `path, title, tipo, project, status, created, updated, date,
  mtime, size, parse_error as parseError`

export function getNote(db: Db, path: string): NoteRow | undefined {
  return db.prepare(`SELECT ${NOTE_COLS} FROM notes WHERE path = ?`).get(path) as NoteRow | undefined
}

export function listNotes(db: Db, filter: { tipo?: string; project?: string } = {}): NoteRow[] {
  const where: string[] = []
  const args: string[] = []
  if (filter.tipo) { where.push('tipo = ?'); args.push(filter.tipo) }
  if (filter.project) { where.push('project = ?'); args.push(filter.project) }
  const sql = `SELECT ${NOTE_COLS} FROM notes
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY title COLLATE NOCASE, path`
  return db.prepare(sql).all(...args) as NoteRow[]
}

export type NoteComCampos = NoteRow & { campos: Record<string, unknown> }

type FieldRow = { key: string; value_text: string | null; value_num: number | null; value_date: string | null }

/**
 * Reidrata as linhas de `fields` de volta para um objeto JS. `value_num` e
 * `value_date` já chegam tipados pela própria coluna; `value_text` que seja
 * JSON válido (objetos e arrays gravados via JSON.stringify pelo Indexer)
 * volta a ser objeto/array — texto que não é JSON (a maioria dos campos)
 * permanece string como está.
 */
function reidratarCampos(rows: FieldRow[]): Record<string, unknown> {
  const campos: Record<string, unknown> = {}
  for (const r of rows) {
    if (r.value_num !== null) { campos[r.key] = r.value_num; continue }
    if (r.value_date !== null) { campos[r.key] = r.value_date; continue }
    if (r.value_text !== null) {
      try { campos[r.key] = JSON.parse(r.value_text) }
      catch { campos[r.key] = r.value_text }
      continue
    }
    campos[r.key] = null
  }
  return campos
}

export function listNotesWithFields(
  db: Db,
  filtro: { tipo?: string; project?: string; desde?: string; ate?: string } = {}
): NoteComCampos[] {
  const notas = listNotes(db, { tipo: filtro.tipo, project: filtro.project }).filter(n => {
    if (filtro.desde && (!n.date || n.date < filtro.desde)) return false
    if (filtro.ate && (!n.date || n.date > filtro.ate)) return false
    return true
  })
  if (notas.length === 0) return []

  const fieldsStmt = db.prepare(
    'SELECT key, value_text, value_num, value_date FROM fields WHERE path = ?'
  )
  return notas.map(n => ({
    ...n,
    campos: reidratarCampos(fieldsStmt.all(n.path) as FieldRow[])
  }))
}

/** Escapa a entrada como frase literal FTS5: aspas internas viram aspas duplicadas. */
function comoFrase(q: string): string {
  return `"${q.replace(/"/g, '""')}"`
}

export function searchFullText(
  db: Db, q: string, limit = 50
): { path: string; title: string; snippet: string }[] {
  const sql = `
    SELECT path, title, snippet(notes_fts, 2, '«', '»', '…', 12) AS snippet
    FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?
  `
  const stmt = db.prepare(sql)
  try {
    return stmt.all(q, limit) as { path: string; title: string; snippet: string }[]
  } catch (err) {
    // FTS5 interpreta o texto como sua própria linguagem de query. Entrada com
    // sintaxe inválida (C++, aspa aberta, foo:bar, NOT solto) lança erro em vez
    // de não achar nada. Nesse caso, buscamos o texto literal — quem sabe usar
    // operadores continua podendo, quem não sabe não vê o app quebrar.
    //
    // Detecção: better-sqlite3 reporta SQLITE_ERROR para qualquer problema de
    // parsing do MATCH (mensagens observadas variam — "fts5: syntax error",
    // "unterminated string", "no such column" — não há um texto único comum
    // entre elas). O SQL desta consulta é fixo e já validado; a única parte
    // variável é `q`, então um SQLITE_ERROR aqui só pode vir da sintaxe do
    // MATCH. Um erro estrutural real (banco corrompido, I/O, sem memória) sai
    // com outro código (SQLITE_CORRUPT, SQLITE_IOERR, SQLITE_NOMEM, ...) e
    // continua sendo relançado.
    if ((err as { code?: string }).code !== 'SQLITE_ERROR') throw err
    return stmt.all(comoFrase(q), limit) as { path: string; title: string; snippet: string }[]
  }
}

export function getBacklinks(
  db: Db, path: string
): { path: string; title: string; line: number }[] {
  return db.prepare(`
    SELECT l.src AS path, n.title AS title, l.line AS line
    FROM links l JOIN notes n ON n.path = l.src
    WHERE l.resolved_path = ?
    ORDER BY n.title COLLATE NOCASE, l.src
  `).all(path) as { path: string; title: string; line: number }[]
}

export function getOutlinks(
  db: Db, path: string
): { dst: string; resolvedPath: string | null; line: number }[] {
  return db.prepare(`
    SELECT dst, resolved_path AS resolvedPath, line FROM links WHERE src = ? ORDER BY line
  `).all(path) as { dst: string; resolvedPath: string | null; line: number }[]
}

export function getBrokenLinks(db: Db): { src: string; dst: string; line: number }[] {
  return db.prepare(`
    SELECT src, dst, line FROM links WHERE resolved_path IS NULL ORDER BY src, line
  `).all() as { src: string; dst: string; line: number }[]
}

/**
 * O que um nó do grafo É.
 *
 * `nota` existe como arquivo. `tag` é uma etiqueta, que não é arquivo nenhum
 * mas liga notas entre si tanto quanto um `[[link]]`. `inexistente` é o alvo
 * de um `[[link]]` que ainda não virou arquivo — uma intenção escrita.
 */
export type EspecieNo = 'nota' | 'tag' | 'inexistente'

/**
 * Um nó do grafo.
 *
 * `id` é a chave, e não `path`, porque tag e nota inexistente não têm
 * caminho: a tag é `#tech`, e a nota que falta é o nome que alguém escreveu
 * entre colchetes. Só quando `especie` é `nota` o `id` é um caminho de
 * arquivo — e é essa a condição para o nó poder ser aberto.
 *
 * `grupo` é o que decide a cor: a pasta de primeiro nível para as notas,
 * `#tags` para as etiquetas, `(inexistente)` para o que falta. Sai daqui, e
 * não da tela, para a tela não precisar saber como um caminho é feito.
 */
export type NoGrafo = {
  id: string
  title: string
  especie: EspecieNo
  grupo: string
  grau: number
}

/** Uma ligação entre dois nós, pelos ids. */
export type ArestaGrafo = { de: string; para: string }

/** O prefixo dos ids que não são arquivo — nunca colide com um caminho. */
const ID_TAG = '#'
const ID_FALTA = '?'

/**
 * O vault inteiro como rede: notas, etiquetas, o que falta, e o que liga tudo.
 *
 * ## Três espécies, e por quê
 *
 * A primeira versão só trazia notas e links resolvidos — 133 nós. Ficava
 * rala perto do grafo que o dono já conhecia, e o motivo não era desenho:
 * metade da rede dele não estava sendo contada.
 *
 * - **Tags.** São 151 neste vault, com 479 ligações. Uma etiqueta liga notas
 *   tanto quanto um `[[link]]`: quem marca `#supabase` em catorze notas está
 *   dizendo que aquelas catorze conversam. Deixá-las de fora era jogar fora
 *   a metade mais densa da rede.
 * - **Notas que ainda não existem.** O alvo de um `[[link]]` sem arquivo. Eu
 *   tinha argumentado que "é intenção, não ligação" — e estava errado num
 *   vault escrito assim: a intenção é o que falta fazer, e é ela que aponta
 *   para onde a rede vai crescer.
 *
 * Quem decide o que aparece é a TELA, com filtros. Daqui vem tudo.
 *
 * ## Sem direção
 *
 * `A → B` e `B → A` são a mesma aresta, e as duas pontas ganham grau. É como
 * o vault funciona: quem escreve `[[Esteira]]` dentro de Escada considera as
 * duas ligadas, e duas setas entre os mesmos pontos só engrossariam a linha.
 *
 * `grau` sai daqui porque é o que decide o tamanho do ponto: o índice conta
 * numa passada, e a tela teria de varrer todas as arestas por nó.
 */
export function grafoDoVault(db: Db): { nos: NoGrafo[]; arestas: ArestaGrafo[] } {
  const vistas = new Set<string>()
  const arestas: ArestaGrafo[] = []
  const grau = new Map<string, number>()

  /** Acrescenta a aresta uma vez só, venha ela de que lado vier. */
  const ligar = (de: string, para: string): void => {
    if (de === para) return
    // A chave é o par ordenado alfabeticamente — a única forma de os dois
    // sentidos caírem no mesmo lugar sem depender de qual apareceu primeiro.
    const chave = de < para ? `${de} ${para}` : `${para} ${de}`
    if (vistas.has(chave)) return
    vistas.add(chave)
    arestas.push({ de, para })
    grau.set(de, (grau.get(de) ?? 0) + 1)
    grau.set(para, (grau.get(para) ?? 0) + 1)
  }

  // Nota ↔ nota, pelos links resolvidos.
  const entreNotas = db.prepare(`
    SELECT DISTINCT l.src AS de, l.resolved_path AS para
    FROM links l
    JOIN notes n ON n.path = l.resolved_path
    WHERE l.resolved_path IS NOT NULL
  `).all() as ArestaGrafo[]
  for (const a of entreNotas) ligar(a.de, a.para)

  // Nota ↔ tag.
  const etiquetas = db.prepare(
    'SELECT path, tag FROM note_tags'
  ).all() as { path: string; tag: string }[]
  for (const t of etiquetas) ligar(t.path, ID_TAG + t.tag)

  // Nota ↔ nota que ainda não existe.
  const faltando = db.prepare(
    'SELECT src, dst FROM links WHERE resolved_path IS NULL'
  ).all() as { src: string; dst: string }[]
  for (const f of faltando) ligar(f.src, ID_FALTA + f.dst)

  /** A pasta de primeiro nível. Nota na raiz não tem pasta. */
  const grupoDa = (path: string): string => {
    const barra = path.indexOf('/')
    return barra < 0 ? '(raiz)' : path.slice(0, barra)
  }

  const nos: NoGrafo[] = []

  // TODAS as notas viram nó, inclusive as sem ligação nenhuma. Elas são a
  // parte da rede que ainda não conectou, e escondê-las seria esconder
  // justamente o que falta ligar.
  const notas = db.prepare(
    'SELECT path, title FROM notes ORDER BY path'
  ).all() as { path: string; title: string }[]
  for (const n of notas) {
    nos.push({
      id: n.path,
      title: n.title,
      especie: 'nota',
      grupo: grupoDa(n.path),
      grau: grau.get(n.path) ?? 0
    })
  }

  for (const t of new Set(etiquetas.map(e => e.tag))) {
    nos.push({
      id: ID_TAG + t,
      title: ID_TAG + t,
      especie: 'tag',
      grupo: '#tags',
      grau: grau.get(ID_TAG + t) ?? 0
    })
  }

  for (const d of new Set(faltando.map(f => f.dst))) {
    nos.push({
      id: ID_FALTA + d,
      title: d,
      especie: 'inexistente',
      grupo: '(inexistente)',
      grau: grau.get(ID_FALTA + d) ?? 0
    })
  }

  return { nos, arestas }
}
