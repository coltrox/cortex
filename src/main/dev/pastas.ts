import { readFile, writeFile, readdir, stat, mkdir, rename, rm } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, dirname, sep, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Acesso às pastas de código da lente Dev.
 *
 * Este é um canal SEPARADO do vault, de propósito. O vault confina tudo abaixo
 * de uma raiz só; o Dev precisa enxergar pastas espalhadas pelo disco. A
 * resposta não foi afrouxar o confinamento do vault — foi criar um segundo
 * confinamento, com uma lista de autorização explícita (`config.pastasDev`)
 * que só cresce por diálogo nativo do processo principal.
 *
 * A regra: o renderer pode nomear uma raiz, mas ela precisa estar na lista,
 * comparada por caminho resolvido. Uma raiz que ele invente é recusada antes
 * de qualquer `fs`.
 */

/** Pastas que nunca entram na árvore: enchem a tela e não são código do autor. */
const IGNORADAS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'out', 'build', '.next',
  '.nuxt', '.turbo', '.cache', 'target', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', 'vendor', 'Pods', '.gradle', 'bin', 'obj'
])

/** Extensões que o editor abre como texto. O resto é tratado como binário. */
const TEXTO = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.mdx',
  '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.svg', '.yml',
  '.yaml', '.toml', '.ini', '.env', '.txt', '.py', '.rb', '.go', '.rs', '.java',
  '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sql', '.sh', '.bash',
  '.ps1', '.bat', '.cmd', '.gitignore', '.editorconfig', '.prettierrc',
  '.eslintrc', '.gradle', '.vue', '.svelte', '.astro', '.prisma', '.graphql'
])

const LIMITE_BYTES = 2_000_000

export type Entrada = {
  nome: string
  /** Caminho relativo à raiz, em POSIX. Vazio para a própria raiz. */
  rel: string
  pasta: boolean
  tamanho: number
  editavel: boolean
}

export function ehTexto(nome: string): boolean {
  const ponto = nome.lastIndexOf('.')
  if (ponto <= 0) return TEXTO.has(nome.toLowerCase())
  return TEXTO.has(nome.slice(ponto).toLowerCase())
}

export class PastasDev {
  /**
   * `raizes` é uma função, não um array: a lista autorizada muda quando o
   * usuário adiciona uma pasta, e uma cópia congelada na construção
   * continuaria recusando a pasta recém-autorizada até reiniciar o app.
   */
  constructor(private raizes: () => string[]) {}

  /**
   * Confere que `raiz` está autorizada e que `rel` não escapa dela.
   * Mesmo formato do guarda do `Vault.toAbsolute` — comparação pelo caminho
   * relativo depois de resolver, não por prefixo de string (que aceitaria
   * `C:\proj-outro` como filho de `C:\proj`).
   */
  resolver(raiz: string, rel: string): string {
    const raizAbs = resolve(raiz)
    const autorizada = this.raizes().some(r => resolve(r) === raizAbs)
    if (!autorizada) throw new Error('pasta não autorizada')

    if (rel === '' || rel === '.') return raizAbs
    if (isAbsolute(rel)) throw new Error('caminho fora da pasta')
    const abs = resolve(raizAbs, rel)
    const deVolta = relative(raizAbs, abs)
    if (deVolta.startsWith('..') || isAbsolute(deVolta)) throw new Error('caminho fora da pasta')
    return abs
  }

  private posix(p: string): string { return p.split(sep).join('/') }

  /** Conteúdo de um nível — pastas primeiro, cada uma em ordem alfabética. */
  async listar(raiz: string, rel: string): Promise<Entrada[]> {
    const abs = this.resolver(raiz, rel)
    const raizAbs = resolve(raiz)
    const entradas = await readdir(abs, { withFileTypes: true })
    const out: Entrada[] = []

    for (const e of entradas) {
      if (e.isDirectory() && IGNORADAS.has(e.name)) continue
      const filho = join(abs, e.name)
      let tamanho = 0
      if (e.isFile()) {
        // Um arquivo que sumiu entre o readdir e o stat não derruba a listagem
        // inteira — some da lista, e o próximo refresh mostra a realidade.
        try { tamanho = (await stat(filho)).size } catch { continue }
      }
      out.push({
        nome: e.name,
        rel: this.posix(relative(raizAbs, filho)),
        pasta: e.isDirectory(),
        tamanho,
        editavel: e.isFile() && ehTexto(e.name) && tamanho <= LIMITE_BYTES
      })
    }

    return out.sort((a, b) =>
      a.pasta === b.pasta ? a.nome.localeCompare(b.nome, 'pt-BR') : (a.pasta ? -1 : 1))
  }

  async ler(raiz: string, rel: string): Promise<string> {
    const abs = this.resolver(raiz, rel)
    const s = await stat(abs)
    if (!s.isFile()) throw new Error('não é um arquivo')
    if (s.size > LIMITE_BYTES) throw new Error(`arquivo grande demais (${Math.round(s.size / 1024)} kB)`)
    if (!ehTexto(basename(abs))) throw new Error('arquivo binário — o editor só abre texto')
    return readFile(abs, 'utf8')
  }

  /** Escrita atômica, mesmo contrato do vault: o arquivo nunca fica parcial. */
  async gravar(raiz: string, rel: string, conteudo: string): Promise<void> {
    const abs = this.resolver(raiz, rel)
    if (!ehTexto(basename(abs))) throw new Error('arquivo binário — o editor só grava texto')
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, conteudo, 'utf8')
    try {
      await rename(tmp, abs)
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
  }
}
