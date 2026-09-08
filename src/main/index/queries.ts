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

/** Um nó do grafo: uma nota, e quantas ligações ela tem. */
export type NoGrafo = { path: string; title: string; tipo: string; grau: number }

/** Uma ligação resolvida entre duas notas do vault. */
export type ArestaGrafo = { de: string; para: string }

/**
 * O vault inteiro como rede: notas e as ligações entre elas.
 *
 * Só links RESOLVIDOS entram. Um `[[link]]` para nota que não existe é
 * intenção, não ligação — desenhá-lo obrigaria a inventar um nó fantasma para
 * ele apontar, e o grafo passaria a mostrar mais coisa que não existe do que
 * coisa que existe.
 *
 * A ligação é tratada como SEM DIREÇÃO: `A → B` e `B → A` são a mesma aresta,
 * e as duas pontas ganham grau. É como o vault funciona de verdade — quem
 * escreve `[[Esteira]]` dentro de Escada considera as duas ligadas, e duas
 * setas entre os mesmos dois pontos só engrossariam a linha.
 *
 * `grau` sai daqui, e não da tela, porque é a contagem que decide o tamanho
 * do ponto: o índice resolve isso numa consulta, e o renderer teria de varrer
 * todas as arestas por nó.
 */
export function grafoDoVault(db: Db): { nos: NoGrafo[]; arestas: ArestaGrafo[] } {
  const brutas = db.prepare(`
    SELECT DISTINCT l.src AS de, l.resolved_path AS para
    FROM links l
    JOIN notes n ON n.path = l.resolved_path
    WHERE l.resolved_path IS NOT NULL AND l.src <> l.resolved_path
  `).all() as ArestaGrafo[]

  /*
   * Deduplica o par nos dois sentidos.
   *
   * A chave é o par ordenado alfabeticamente — a única forma de os dois
   * sentidos caírem no mesmo lugar sem depender de qual apareceu primeiro.
   */
  const vistas = new Set<string>()
  const arestas: ArestaGrafo[] = []
  const grau = new Map<string, number>()
  for (const a of brutas) {
    const chave = a.de < a.para ? `${a.de} ${a.para}` : `${a.para} ${a.de}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    arestas.push(a)
    grau.set(a.de, (grau.get(a.de) ?? 0) + 1)
    grau.set(a.para, (grau.get(a.para) ?? 0) + 1)
  }

  // TODAS as notas viram nó, inclusive as sem ligação nenhuma. Elas são a
  // parte do cérebro que ainda não conectou, e escondê-las seria esconder
  // justamente o que falta ligar.
  const notas = db.prepare(
    'SELECT path, title, tipo FROM notes ORDER BY path'
  ).all() as { path: string; title: string; tipo: string }[]

  return {
    nos: notas.map(n => ({ ...n, grau: grau.get(n.path) ?? 0 })),
    arestas
  }
}
