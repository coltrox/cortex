import { readFile, writeFile, rename, mkdir, stat, readdir, rm } from 'node:fs/promises'
import { join, resolve, relative, dirname, sep, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'

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

  async read(rel: string): Promise<string> {
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
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, content, 'utf8')
    try {
      await rename(tmp, abs)
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
  }

  async stat(rel: string): Promise<{ mtimeMs: number; size: number }> {
    const s = await stat(this.toAbsolute(rel))
    return { mtimeMs: s.mtimeMs, size: s.size }
  }

  async exists(rel: string): Promise<boolean> {
    try { await stat(this.toAbsolute(rel)); return true } catch { return false }
  }
}
