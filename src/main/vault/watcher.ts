import chokidar, { type FSWatcher } from 'chokidar'
import { relative, sep } from 'node:path'
import type { Vault } from './vault'
import type { Indexer } from '../index/indexer'
import type { Db } from '../index/db'
import { resolveLinks } from '../index/resolver'

type Kind = 'add' | 'change' | 'unlink'

export class VaultWatcher {
  private watcher: FSWatcher | null = null
  private fila = new Map<string, Kind>()
  private timer: NodeJS.Timeout | null = null
  private drenando: Promise<void> | null = null

  constructor(
    private vault: Vault,
    private indexer: Indexer,
    private db: Db,
    private onChange: (rel: string, kind: Kind) => void,
    private onError: (err: Error, rel: string) => void =
      (err, rel) => console.error(`[cortex] falha ao indexar ${rel}:`, err)
  ) {}

  async start(): Promise<void> {
    this.watcher = chokidar.watch(this.vault.root, {
      ignoreInitial: true,
      ignored: (p: string) => {
        const rel = relative(this.vault.root, p)
        return rel.startsWith('.') || rel.includes(`${sep}.`) || rel.endsWith('.tmp')
      },
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 }
    })
    for (const kind of ['add', 'change', 'unlink'] as Kind[]) {
      this.watcher.on(kind, (abs: string) => this.enfileirar(abs, kind))
    }
    await new Promise<void>(ok => this.watcher!.once('ready', () => ok()))
  }

  private enfileirar(abs: string, kind: Kind): void {
    const rel = relative(this.vault.root, abs).split(sep).join('/')
    if (!rel.toLowerCase().endsWith('.md')) return
    this.fila.set(rel, kind)
    this.agendar()
  }

  private agendar(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.drenando = this.drenar().finally(() => { this.drenando = null })
    }, 100)
  }

  /** Agrupa rajadas: salvar um arquivo pode disparar vários eventos seguidos. */
  private async drenar(): Promise<void> {
    const lote = [...this.fila.entries()]
    this.fila.clear()
    const processados: [string, Kind][] = []
    for (const [rel, kind] of lote) {
      try {
        if (kind === 'unlink') this.indexer.removeFile(rel)
        else await this.indexer.indexFile(rel)
        processados.push([rel, kind])
      } catch (err) {
        // Arquivo sumiu entre o evento e a leitura: corrida esperada e benigna.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
        // Qualquer outra falha significa que o índice parou de refletir o disco.
        // Não podemos derrubar o watcher — as outras notas ainda precisam dele —
        // mas o silêncio aqui já custou caro neste projeto.
        this.onError(err as Error, rel)
      }
    }
    // resolveLinks recomputa o vault inteiro: uma única chamada por lote, fora do
    // laço acima, cobre tanto indexações quanto remoções (removeFile não chama
    // resolveLinks sozinho — ver ADENDO da Task 9). Protegida por try/catch: sem
    // isso, uma falha aqui vira rejeição de promessa não tratada, já que drenar()
    // é disparado como "void this.drenar()" pelo timer.
    if (processados.length > 0) {
      try {
        resolveLinks(this.db)
      } catch (err) {
        this.onError(err as Error, '(resolveLinks)')
      }
    }
    for (const [rel, kind] of processados) this.onChange(rel, kind)
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    // Fecha o chokidar antes de esperar o drenar em voo: se esperássemos primeiro,
    // eventos novos poderiam ser enfileirados enquanto aguardamos.
    await this.watcher?.close()
    this.watcher = null
    await this.drenando
  }
}
