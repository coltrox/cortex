/**
 * Conector do Cortex para o Claude (MCP, por stdio).
 *
 * Roda FORA do app: o Claude Code sobe este script como processo filho,
 * usando o próprio Cortex.exe em modo Node (ELECTRON_RUN_AS_NODE=1). Por isso
 * não há dependência nova — o JSON-RPC é escrito à mão, e o gray-matter vem
 * das dependências que o app já empacota (`CORTEX_APP`).
 *
 * O que ele NUNCA entrega, nem por busca nem por leitura direta:
 *  - `Vida/Contas` e `Vida/Documentos` (senhas e documentos);
 *  - as pastas de painéis trancados no `.vault/config.json`;
 *  - qualquer arquivo cifrado, e notas de tipo `conta` ou `documento`;
 *  - pastas que começam com ponto (`.vault`, `.git`…).
 *
 * Escrita, só duas: uma anotação nova em `Vida/` e marcar uma tarefa diária
 * no diário. Nada é sobrescrito nem apagado.
 */
import { createRequire } from 'node:module'
import { readFile, writeFile, readdir, rename, mkdir, stat } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, sep, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'

export const MARCA_CIFRA = 'CORTEX-CIFRADO-1'
export const PROTEGIDAS_SEMPRE = ['Vida/Contas', 'Vida/Documentos']
const TIPOS_SENSIVEIS = new Set(['conta', 'documento'])
const PASTAS_POR_AREA = {
  vida: ['Vida', 'Vida/Documentos', 'Vida/Contas'],
  saude: ['Saude', 'Saude/Treinos', 'Saude/Dieta'],
  dev: ['Dev', 'Dev/Projetos', 'Dev/Seguranca'],
  conhecimento: ['Estudos', 'Estudos/Conteudos', 'Estudos/Provas', 'Estudos/Redacoes'],
  financas: ['Grana'],
  calendario: []
}
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
const MAX_ARQUIVOS = 20000
const MAX_TEXTO = 20000

/* ---------------- utilidades puras (exportadas para teste) ---------------- */

/** Pastas que o conector não enxerga, dado o que está trancado no app. */
export function pastasBloqueadas(paineisTrancados) {
  const out = new Set(PROTEGIDAS_SEMPRE)
  for (const p of Array.isArray(paineisTrancados) ? paineisTrancados : []) {
    if (typeof p !== 'string') continue
    // Área vira as pastas dela; sub-área já é o caminho da pasta.
    if (PASTAS_POR_AREA[p]) for (const x of PASTAS_POR_AREA[p]) out.add(x)
    else if (p.trim()) out.add(p.replace(/\\/g, '/').replace(/\/+$/, ''))
  }
  return [...out]
}

export function bloqueado(rel, bloqueadas) {
  const p = rel.replace(/\\/g, '/')
  if (p.split('/').some(s => s.startsWith('.'))) return true
  const baixo = p.toLowerCase()
  return bloqueadas.some(b => {
    const bb = b.toLowerCase()
    return baixo === bb || baixo.startsWith(bb + '/')
  })
}

/**
 * Caminho relativo vindo do Claude → caminho absoluto dentro do vault.
 * Nulo para absoluto, `..`, byte nulo ou arquivo que não é `.md`.
 */
export function resolverNoVault(vault, rel) {
  if (typeof rel !== 'string' || !rel.trim() || rel.includes('\0') || isAbsolute(rel)) return null
  const raiz = resolve(vault)
  const abs = resolve(raiz, rel)
  const r = relative(raiz, abs)
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  if (!abs.toLowerCase().endsWith('.md')) return null
  return { abs, rel: r.split(sep).join('/') }
}

export const dobra = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** O mesmo saneamento de nome de arquivo que o app usa. */
export function nomeArquivo(s) {
  return String(s).replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function diaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function diaDaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return DIAS[new Date(a, m - 1, d).getDay()]
}

export function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  return diaLocal(new Date(a, m - 1, d + n))
}

const isoDates = v => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (Array.isArray(v)) return v.map(isoDates)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isoDates(x)]))
  return v
}

const textos = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String)

/* ---------------- vault ---------------- */

function carregarMatter() {
  const base = process.env.CORTEX_APP
  const tentativas = [base && join(base, 'package.json'), import.meta.url].filter(Boolean)
  for (const t of tentativas) {
    try { return createRequire(t)('gray-matter') } catch { /* tenta a próxima */ }
  }
  return null
}

export function criarConector({ vault, matter }) {
  const parse = raw => {
    if (!matter) return { data: {}, content: raw }
    try {
      const p = matter(raw, {})
      return { data: isoDates(p.data), content: p.content }
    } catch {
      return { data: {}, content: raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') }
    }
  }

  async function bloqueadas() {
    try {
      const cfg = JSON.parse(await readFile(join(vault, '.vault', 'config.json'), 'utf8'))
      return pastasBloqueadas(cfg.paineisTrancados)
    } catch {
      return pastasBloqueadas([])
    }
  }

  /** Todas as notas legíveis. Cifradas, protegidas e sensíveis nem entram. */
  async function notas() {
    const bloq = await bloqueadas()
    const out = []
    const andar = async dirRel => {
      if (out.length >= MAX_ARQUIVOS) return
      let itens
      try { itens = await readdir(join(vault, dirRel), { withFileTypes: true }) } catch { return }
      for (const it of itens) {
        const rel = dirRel ? `${dirRel}/${it.name}` : it.name
        if (bloqueado(rel, bloq) || it.name === 'node_modules') continue
        if (it.isDirectory()) await andar(rel)
        else if (it.isFile() && it.name.toLowerCase().endsWith('.md')) {
          let raw
          try { raw = await readFile(join(vault, rel), 'utf8') } catch { continue }
          if (raw.startsWith(MARCA_CIFRA)) continue
          const { data, content } = parse(raw)
          const tipo = typeof data.tipo === 'string' ? data.tipo : ''
          if (TIPOS_SENSIVEIS.has(tipo)) continue
          const titulo = [data.titulo, data.title].find(x => typeof x === 'string' && x.trim()) ?? basename(rel, '.md')
          out.push({ rel, data, content, tipo, titulo })
          if (out.length >= MAX_ARQUIVOS) return
        }
      }
    }
    await andar('')
    return out
  }

  async function gravarAtomico(abs, texto) {
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.tmp`
    await writeFile(tmp, texto, 'utf8')
    await rename(tmp, abs)
  }

  const existe = async abs => { try { await stat(abs); return true } catch { return false } }

  /* ---------------- ferramentas ---------------- */

  async function buscar_notas({ termo, limite }) {
    const q = dobra(termo).trim()
    if (!q) throw new Error('Informe um termo de busca.')
    const max = Math.min(Math.max(Number(limite) || 20, 1), 50)
    const achadas = []
    for (const n of await notas()) {
      const t = dobra(n.titulo)
      let p = null
      if (t === q) p = 0
      else if (t.startsWith(q)) p = 1
      else if (t.includes(q)) p = 2
      else if (dobra(n.rel).includes(q)) p = 3
      else if (dobra(n.tipo).includes(q)) p = 4
      else if (dobra(n.content).includes(q)) p = 5
      if (p !== null) achadas.push({ n, p })
    }
    achadas.sort((a, b) => a.p - b.p || a.n.titulo.localeCompare(b.n.titulo))
    if (achadas.length === 0) return `Nada encontrado para "${termo}".`
    return achadas.slice(0, max)
      .map(({ n }) => `- ${n.titulo}${n.tipo ? ` (${n.tipo})` : ''} — ${n.rel}`)
      .join('\n')
  }

  async function ler_nota({ caminho }) {
    const alvo = resolverNoVault(vault, caminho)
    if (!alvo) throw new Error('Caminho inválido: use o caminho relativo de uma nota .md do vault.')
    if (bloqueado(alvo.rel, await bloqueadas())) throw new Error('Esta nota está numa pasta protegida e não é compartilhada.')
    let raw
    try { raw = await readFile(alvo.abs, 'utf8') } catch { throw new Error(`Nota não encontrada: ${alvo.rel}`) }
    if (raw.startsWith(MARCA_CIFRA)) throw new Error('Esta nota está cifrada e não é compartilhada.')
    const { data, content } = parse(raw)
    if (TIPOS_SENSIVEIS.has(data.tipo)) throw new Error('Notas de conta e documento não são compartilhadas.')
    // Campo com cara de segredo não sai, em nota de qualquer tipo.
    const campos = Object.entries(data)
      .filter(([k]) => !/senha|password|token|secret|pin\b/i.test(k))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    return `# ${alvo.rel}\n\n${campos.length ? `## Campos\n${campos.join('\n')}\n\n` : ''}## Texto\n${content.trim()}`
  }

  async function hoje({ dia }) {
    const d = typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : diaLocal()
    const semana = diaDaSemana(d)
    const todas = await notas()
    const diario = todas.find(n => n.rel === `Diario/${d}.md`)
    const feitas = textos(diario?.data.rotinas_feitas)
    const tomados = textos(diario?.data.suplementos_feitos)
    const noDia = n => { const ds = textos(n.data.dias); return ds.length === 0 || ds.includes(semana) }
    const data = n => (typeof n.data.date === 'string' ? n.data.date : '')

    const rotinas = todas.filter(n => n.tipo === 'rotina' && noDia(n))
    const suplementos = todas.filter(n => n.tipo === 'suplemento' && noDia(n))
    const compromissos = todas.filter(n => n.tipo === 'evento' && data(n) === d)
      .sort((a, b) => String(a.data.hora ?? '').localeCompare(String(b.data.hora ?? '')))
    const limite = somarDias(d, 7)
    const tarefas = todas.filter(n => n.tipo === 'tarefa' && n.data.feito !== true && (!data(n) || data(n) <= limite))
      .sort((a, b) => (data(a) || '9').localeCompare(data(b) || '9'))
    const provas = todas.filter(n => n.tipo === 'prova' && data(n) >= d && data(n) <= somarDias(d, 30))
      .sort((a, b) => data(a).localeCompare(data(b)))

    const marca = ok => (ok ? '[x]' : '[ ]')
    const secao = (nome, linhas) => `## ${nome}\n${linhas.length ? linhas.join('\n') : '(nada)'}`
    return [
      `# ${d} (${semana})`,
      secao('Tarefas do dia', rotinas.map(r => `- ${marca(feitas.includes(r.titulo))} ${r.titulo}${r.data.quando ? ` · ${r.data.quando}` : ''}`)),
      secao('Suplementos', suplementos.map(s => `- ${marca(tomados.includes(s.titulo))} ${s.titulo}${s.data.dose ? ` · ${s.data.dose}` : ''}`)),
      secao('Compromissos', compromissos.map(c => `- ${c.data.hora ? `${c.data.hora} ` : ''}${c.titulo}`)),
      secao('Tarefas abertas (até 7 dias)', tarefas.map(t => `- ${data(t) || 'sem data'} · ${t.titulo}`)),
      secao('Provas nos próximos 30 dias', provas.map(p => `- ${data(p)} · ${p.titulo}`))
    ].join('\n\n')
  }

  async function criar_anotacao({ titulo, texto, prioridade }) {
    if (typeof titulo !== 'string' || !nomeArquivo(titulo)) throw new Error('A anotação precisa de um título.')
    if (texto != null && typeof texto !== 'string') throw new Error('O texto precisa ser uma string.')
    if ((texto ?? '').length > MAX_TEXTO) throw new Error(`Texto longo demais (máximo ${MAX_TEXTO} caracteres).`)
    if (bloqueado('Vida/x.md', await bloqueadas())) {
      throw new Error('A área Vida está trancada no Cortex: a anotação não pode ser gravada sem cifra.')
    }
    const base = nomeArquivo(titulo)
    let rel = `Vida/${base}.md`
    for (let i = 2; await existe(join(vault, rel)); i++) {
      if (i > 99) throw new Error('Já existem anotações demais com esse título.')
      rel = `Vida/${base} ${i}.md`
    }
    // Strings em JSON são YAML válido: aspas, dois-pontos e quebra de linha
    // saem escapados sem depender de biblioteca nenhuma.
    const linhas = ['tipo: anotacao', `titulo: ${JSON.stringify(titulo.trim())}`]
    if (texto) linhas.push(`texto: ${JSON.stringify(texto)}`)
    if (prioridade === true) linhas.push('prioridade: true')
    await gravarAtomico(join(vault, rel), `---\n${linhas.join('\n')}\n---\n\n`)
    return `Anotação criada: ${rel}`
  }

  async function marcar_tarefa_do_dia({ nome, dia, feito }) {
    if (!matter) throw new Error('Leitor de YAML indisponível: rode o conector pelo Cortex.')
    if (typeof nome !== 'string' || !nome.trim()) throw new Error('Informe o nome da tarefa diária.')
    const d = typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : diaLocal()
    const semana = diaDaSemana(d)
    const rotinas = (await notas()).filter(n => {
      if (n.tipo !== 'rotina') return false
      const ds = textos(n.data.dias)
      return ds.length === 0 || ds.includes(semana)
    })
    const alvo = rotinas.find(r => dobra(r.titulo) === dobra(nome.trim()))
      ?? rotinas.find(r => dobra(r.titulo).includes(dobra(nome.trim())))
    if (!alvo) {
      throw new Error(`Nenhuma tarefa diária "${nome}" em ${d}. As do dia: ${rotinas.map(r => r.titulo).join(', ') || 'nenhuma'}.`)
    }
    const abs = join(vault, 'Diario', `${d}.md`)
    const raw = (await existe(abs))
      ? await readFile(abs, 'utf8')
      : `---\ntipo: diario\ndate: ${d}\n---\n\n## Como foi o dia\n`
    let p
    try { p = matter(raw, {}) } catch { throw new Error('O diário do dia tem YAML inválido; corrija no Cortex antes.') }
    const data = isoDates(p.data)
    const atual = textos(data.rotinas_feitas)
    const marcar = feito !== false
    data.rotinas_feitas = marcar
      ? (atual.includes(alvo.titulo) ? atual : [...atual, alvo.titulo])
      : atual.filter(x => x !== alvo.titulo)
    await gravarAtomico(abs, matter.stringify(p.content, data))
    return `${marcar ? 'Marcada' : 'Desmarcada'}: ${alvo.titulo} (${d})`
  }

  return { buscar_notas, ler_nota, hoje, criar_anotacao, marcar_tarefa_do_dia }
}

/* ---------------- protocolo ---------------- */

export const FERRAMENTAS = [
  {
    name: 'buscar_notas',
    description: 'Busca notas do vault do Cortex por título, caminho, tipo ou texto. Devolve título, tipo e caminho.',
    inputSchema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'O que procurar.' },
        limite: { type: 'number', description: 'Máximo de resultados (1 a 50, padrão 20).' }
      },
      required: ['termo']
    }
  },
  {
    name: 'ler_nota',
    description: 'Lê uma nota do vault pelo caminho relativo (ex.: "Estudos/Provas/ENEM.md").',
    inputSchema: {
      type: 'object',
      properties: { caminho: { type: 'string', description: 'Caminho relativo da nota .md.' } },
      required: ['caminho']
    }
  },
  {
    name: 'hoje',
    description: 'Resumo de um dia: tarefas diárias (feitas ou não), suplementos, compromissos, tarefas abertas e provas próximas.',
    inputSchema: {
      type: 'object',
      properties: { dia: { type: 'string', description: 'Data AAAA-MM-DD. Padrão: hoje.' } }
    }
  },
  {
    name: 'criar_anotacao',
    description: 'Cria uma anotação nova na área Vida do Cortex. Nunca sobrescreve.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        texto: { type: 'string' },
        prioridade: { type: 'boolean', description: 'Vai para o topo da lista.' }
      },
      required: ['titulo']
    }
  },
  {
    name: 'marcar_tarefa_do_dia',
    description: 'Marca (ou desmarca, com feito=false) uma tarefa diária no diário do dia.',
    inputSchema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome da tarefa diária.' },
        dia: { type: 'string', description: 'Data AAAA-MM-DD. Padrão: hoje.' },
        feito: { type: 'boolean', description: 'false desmarca. Padrão: true.' }
      },
      required: ['nome']
    }
  }
]

async function vaultAtual() {
  const dados = process.env.CORTEX_DADOS
    || join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Cortex')
  let raiz
  try { raiz = JSON.parse(await readFile(join(dados, 'cortex.json'), 'utf8')).ultimoVault } catch { raiz = null }
  if (typeof raiz !== 'string' || !raiz) throw new Error('Nenhum vault aberto no Cortex ainda. Abra o app uma vez.')
  const s = await stat(raiz).catch(() => null)
  if (!s?.isDirectory()) throw new Error(`O último vault do Cortex não existe mais: ${raiz}`)
  return raiz
}

export async function responder(msg, obterConector) {
  const { id, method, params } = msg ?? {}
  const ok = result => ({ jsonrpc: '2.0', id, result })
  const erro = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })
  // Notificação (sem id): não se responde.
  if (id === undefined || id === null) return null

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'cortex', version: '1.0.0' },
        instructions: 'Vault pessoal do Cortex. Contas, senhas, documentos e painéis trancados não são acessíveis.'
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: FERRAMENTAS })
    case 'tools/call': {
      const nome = params?.name
      if (!FERRAMENTAS.some(f => f.name === nome)) return erro(-32602, `Ferramenta desconhecida: ${nome}`)
      const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}
      try {
        const conector = await obterConector()
        const texto = await conector[nome](args)
        return ok({ content: [{ type: 'text', text: texto }] })
      } catch (e) {
        return ok({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true })
      }
    }
    default:
      return erro(-32601, `Método não suportado: ${method}`)
  }
}

function principal() {
  const matter = carregarMatter()
  // O vault é relido a cada chamada: trocar de vault no app vale na hora.
  const obterConector = async () => criarConector({ vault: await vaultAtual(), matter })
  let buffer = ''
  const pendentes = new Set()
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', pedaco => {
    buffer += pedaco
    let fim
    while ((fim = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, fim).trim()
      buffer = buffer.slice(fim + 1)
      if (!linha) continue
      let msg
      try { msg = JSON.parse(linha) } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }) + '\n')
        continue
      }
      const p = responder(msg, obterConector)
        .then(r => { if (r) process.stdout.write(JSON.stringify(r) + '\n') })
        .finally(() => pendentes.delete(p))
      pendentes.add(p)
    }
  })
  // Fim da entrada: responde o que já estava em andamento antes de sair.
  process.stdin.on('end', () => {
    void Promise.allSettled([...pendentes]).then(() => process.exit(0))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal()
