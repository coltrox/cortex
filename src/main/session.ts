import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { Vault } from './vault/vault'
import { VaultWatcher } from './vault/watcher'
import { openIndex, SCHEMA_VERSION, type Db } from './index/db'
import { Indexer } from './index/indexer'

/**
 * Abre o índice, reconstruindo do zero se estiver corrompido ou de versão antiga.
 * O banco é derivado dos .md: descartá-lo é sempre seguro e sempre preferível
 * a falhar a abertura do vault.
 *
 * A sondagem usa sua própria conexão (em vez de reaproveitar `openIndex`) e a
 * fecha explicitamente antes de qualquer `rm`: no Windows, um handle do
 * better-sqlite3 deixado aberto (por exemplo porque `exec` lançou no meio de
 * `openIndex`, sem devolver a instância para fechar) trava o arquivo e o
 * `unlink` subsequente falha com EBUSY.
 */
async function openOrRebuildIndex(dbPath: string): Promise<Db> {
  if (existsSync(dbPath)) {
    let sondagem: Database.Database | undefined
    let saudavel = false
    try {
      sondagem = new Database(dbPath)
      const row = sondagem.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as
        { value: string } | undefined
      sondagem.prepare('SELECT count(*) FROM notes').get()
      saudavel = row !== undefined && Number(row.value) === SCHEMA_VERSION
    } catch {
      saudavel = false
    } finally {
      try { sondagem?.close() } catch { /* nunca abriu ou já fechado */ }
    }
    if (saudavel) return openIndex(dbPath)
    await rm(dbPath, { force: true })
    await rm(`${dbPath}-wal`, { force: true })
    await rm(`${dbPath}-shm`, { force: true })
  }
  return openIndex(dbPath)
}

export class Session {
  vault!: Vault
  db!: Db
  indexer!: Indexer
  private watcher: VaultWatcher | null = null
  private aberta = false

  get isOpen(): boolean { return this.aberta }

  async open(root: string, onChange: (rel: string) => void = () => {}): Promise<void> {
    await this.close()
    this.vault = new Vault(root)
    const dir = join(this.vault.root, '.vault')
    await mkdir(dir, { recursive: true })
    this.db = await openOrRebuildIndex(join(dir, 'index.db'))
    this.indexer = new Indexer(this.db, this.vault)
    await this.indexer.syncAll()
    // `onChange` desta task só repassa o caminho relativo (contrato herdado do
    // brief da Task 10, usado por `vault:changed` no preload); `kind`
    // ('add'/'change'/'unlink') não é repassado porque nada nesta camada
    // consome essa distinção ainda — não é esquecimento.
    this.watcher = new VaultWatcher(this.vault, this.indexer, this.db, rel => onChange(rel))
    await this.watcher.start()
    this.aberta = true
  }

  async close(): Promise<void> {
    await this.watcher?.stop()
    this.watcher = null
    if (this.aberta) this.db.close()
    this.aberta = false
  }
}
