import { readFile, writeFile, rename, mkdir, stat, readdir, rm } from 'node:fs/promises'
import type { Cofre } from '../cofre'
import { join, resolve, relative, dirname, sep, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { VaultRootMissingError } from './errors'

export class Vault {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  toAbsolute(rel: string): string {
    if (isAbsolute(rel)) throw new Error('caminho fora do vault')
    const abs = resolve(this.root, rel)
    const rel2 = relative(this.root, abs)
    if (rel2.startsWith('..') || isAbsolute(rel2)) throw new Error('caminho fora do vault')
    return abs
  }

  private toPosix(p: string): string {
    return p.split(sep).join('/')
  }

  async listMarkdown(): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) await walk(abs)
        else if (entry.name.toLowerCase().endsWith('.md')) {
          out.push(this.toPosix(relative(this.root, abs)))
        }
      }
    }
    await walk(this.root)
    return out
  }

  /**
   * O cofre dos painéis trancados, quando existe.
   *
   * Fica aqui, e não num decorador em volta, porque `read`/`writeAtomic` são
   * o ponto ÚNICO por onde o app inteiro lê e grava nota — inclusive o
   * indexador. Uma camada por fora deixaria de fora quem chamasse o Vault
   * direto, e seria só questão de tempo até alguém gravar texto puro dentro
   * de uma pasta cifrada.
   */
  private cofre: Cofre | null = null

  usarCofre(cofre: Cofre | null): void {
    this.cofre = cofre
  }

  async read(rel: string): Promise<string> {
    const bruto = await readFile(this.toAbsolute(rel), 'utf8')
    return this.cofre ? this.cofre.paraLer(bruto) : bruto
  }

  /**
   * O conteúdo como está no disco, sem decifrar.
   *
   * Só para a conversão de pastas (cifrar/decifrar em lote), que precisa
   * enxergar o estado real de cada arquivo. Ninguém mais deveria chamar isto.
   */
  async readBruto(rel: string): Promise<string> {
    return readFile(this.toAbsolute(rel), 'utf8')
  }

  /**
   * Grava em .tmp e renomeia: o .md nunca fica parcial.
   * O nome do temporário inclui `randomUUID()`, não só `process.pid`: é único
   * por CHAMADA, não por processo, para que duas escritas simultâneas no
   * mesmo caminho usem arquivos temporários distintos em vez de colidir num
   * único `.pid.tmp` compartilhado. Em caso de falha no `rename`, o temporário
   * é removido explicitamente para não deixar lixo `.tmp` no vault.
   */
  async writeAtomic(rel: string, content: string): Promise<void> {
    const abs = this.toAbsolute(rel)
    // Antes de qualquer coisa: se este caminho é protegido e o cofre está
    // fechado, isto lança e nada é gravado. Gravar texto puro numa pasta
    // cifrada decifraria o vault sem ninguém pedir, e em silêncio.
    const paraDisco = this.cofre ? this.cofre.paraGravar(rel, content) : content

    // A raiz precisa existir e ser um diretório *antes* de qualquer mkdir.
    // `mkdir(dir, { recursive: true })` cria todos os ancestrais que
    // faltarem, inclusive a própria raiz do vault — se ela sumiu (deletada,
    // pasta renomeada, drive externo desconectado) depois que a sessão já
    // estava aberta, isso a reconstruiria vazia em silêncio, e a escrita
    // seguiria feliz para dentro de uma casca fantasma enquanto as notas
    // reais do usuário já se foram. Mesmo defeito, mesmo erro distinguível
    // de `Session.open` (spec §10: "não cria vault vazio por cima").
    let raizStat
    try {
      raizStat = await stat(this.root)
    } catch {
      throw new VaultRootMissingError(this.root)
    }
    if (!raizStat.isDirectory()) throw new VaultRootMissingError(this.root)

    // Com a raiz confirmada, recriar os subdiretórios da nota é seguro e
    // idempotente.
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, paraDisco, 'utf8')
    try {
      await rename(tmp, abs)
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
  }

  /**
   * Apaga uma nota. `force: true` porque apagar o que já não está lá é o
   * estado desejado — dois cliques rápidos no botão de excluir não podem
   * virar erro na cara do usuário.
   */
  async remover(rel: string): Promise<void> {
    await rm(this.toAbsolute(rel), { force: true })
  }

  /**
   * Move uma nota de lugar. É como o app arrasta uma nota entre pastas.
   * Recusa se o destino já existe: sobrescrever aqui apagaria uma nota
   * inteira em silêncio, e nenhum arrastar de mouse justifica isso.
   */
  async mover(de: string, para: string): Promise<void> {
    const origem = this.toAbsolute(de)
    const destino = this.toAbsolute(para)
    if (origem === destino) return
    let ocupado = true
    try {
      await stat(destino)
    } catch (err) {
      // ENOENT é o caminho feliz: o destino está livre.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
      ocupado = false
    }
    if (ocupado) throw new Error(`já existe uma nota em ${para}`)
    await mkdir(dirname(destino), { recursive: true })
    await rename(origem, destino)
  }

  /** Todas as pastas do vault, em POSIX, relativas à raiz. Ordenadas. */
  async listarPastas(): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const abs = join(dir, entry.name)
        out.push(this.toPosix(relative(this.root, abs)))
        await walk(abs)
      }
    }
    await walk(this.root)
    return out.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  /** Cria uma pasta vazia. Idempotente. */
  async criarPasta(rel: string): Promise<void> {
    await mkdir(this.toAbsolute(rel), { recursive: true })
  }

  async stat(rel: string): Promise<{ mtimeMs: number; size: number }> {
    const s = await stat(this.toAbsolute(rel))
    return { mtimeMs: s.mtimeMs, size: s.size }
  }

  async exists(rel: string): Promise<boolean> {
    try { await stat(this.toAbsolute(rel)); return true } catch { return false }
  }
}
