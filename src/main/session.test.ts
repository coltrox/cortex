import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { access, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session, VaultRootMissingError } from './session'
import { Indexer } from './index/indexer'

let root: string
let session: Session

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-session-'))
  session = new Session()
})

afterEach(async () => {
  await session.close()
  await rm(root, { recursive: true, force: true })
})

describe('Session.open — raiz do vault ausente (não deve resurrecir um vault vazio)', () => {
  it('rejeita quando a raiz não existe, e a raiz continua ausente depois', async () => {
    const raizFantasma = join(root, 'nao-existe-mais')

    await expect(session.open(raizFantasma)).rejects.toThrow(VaultRootMissingError)

    // A prova real de que o defeito foi corrigido: nada foi criado no disco.
    await expect(access(raizFantasma)).rejects.toThrow()
  })

  it('rejeita quando a raiz existe mas é um arquivo, não um diretório', async () => {
    const arquivo = join(root, 'nao-e-pasta.txt')
    await writeFile(arquivo, 'x', 'utf8')

    await expect(session.open(arquivo)).rejects.toThrow(VaultRootMissingError)
  })

  it('caso normal: uma pasta existente abre, indexa e lista notas', async () => {
    await writeFile(join(root, 'a.md'), '# a', 'utf8')

    await expect(session.open(root)).resolves.not.toThrow()
    expect(session.isOpen).toBe(true)

    const rows = session.db.prepare('SELECT path FROM notes').all() as { path: string }[]
    expect(rows.map(r => r.path)).toEqual(['a.md'])
  })
})

describe('Session.open — não deve vazar o handle do db se algo lançar antes de `aberta = true`', () => {
  it('quando indexer.syncAll rejeita, open() rejeita e o arquivo do índice pode ser apagado depois', async () => {
    const spy = vi.spyOn(Indexer.prototype, 'syncAll').mockRejectedValueOnce(new Error('ENOENT simulado'))

    await expect(session.open(root)).rejects.toThrow('ENOENT simulado')
    expect(session.isOpen).toBe(false)

    const dbPath = join(root, '.vault', 'index.db')
    // Prova direta: nenhum handle better-sqlite3 continua aberto apontando
    // para este Session (o catch em open() fechou explicitamente this.db).
    expect(() => session.db.prepare('SELECT 1').get()).toThrow()

    // Prova adicional, no espírito do que EBUSY provaria no Windows: o
    // arquivo do índice pode ser removido do disco sem erro.
    await expect(rm(dbPath, { force: true })).resolves.not.toThrow()
    await expect(stat(dbPath)).rejects.toThrow()

    spy.mockRestore()
  })
})
