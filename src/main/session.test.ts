import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

describe('Session.open — vaultId estável entre aberturas (achado da revisão da Task 2)', () => {
  // O bug original comparava `existsSync(configPath)`, não o id em si: um
  // config.json que já existe (antigo, sem vaultId, ou corrompido) fazia a
  // gravação ser pulada, e cada abertura inventava um id novo — orfanando o
  // celular. Os três casos abaixo cobrem os cenários que esse proxy errado
  // deixava passar, mais o caso que já funcionava.

  it('config.json pré-existente sem vaultId ganha um e mantém o mesmo id na próxima abertura', async () => {
    const dir = join(root, '.vault')
    await mkdir(dir, { recursive: true })
    const configPath = join(dir, 'config.json')
    await writeFile(configPath, JSON.stringify({ areas: ['vida'], pastasDev: [], escolheu: true }), 'utf8')

    await session.open(root)
    const primeiro = session.config.vaultId
    expect(primeiro).toMatch(/^[0-9a-f]{8}-/)

    // A prova de que não ficou só em memória: o arquivo tem o mesmo id.
    const gravado = JSON.parse(await readFile(configPath, 'utf8')) as { vaultId?: string }
    expect(gravado.vaultId).toBe(primeiro)

    await session.close()
    await session.open(root)
    expect(session.config.vaultId).toBe(primeiro)
  })

  it('config.json corrompido ganha vaultId estável entre aberturas', async () => {
    const dir = join(root, '.vault')
    await mkdir(dir, { recursive: true })
    const configPath = join(dir, 'config.json')
    await writeFile(configPath, '{ "areas": ["vida"', 'utf8')

    await session.open(root)
    const primeiro = session.config.vaultId
    expect(primeiro).toMatch(/^[0-9a-f]{8}-/)

    const gravado = JSON.parse(await readFile(configPath, 'utf8')) as { vaultId?: string }
    expect(gravado.vaultId).toBe(primeiro)

    await session.close()
    await session.open(root)
    expect(session.config.vaultId).toBe(primeiro)
  })

  it('vault sem config.json nenhum nasce com id e persiste (caso que já funcionava)', async () => {
    await session.open(root)
    const primeiro = session.config.vaultId
    expect(primeiro).toMatch(/^[0-9a-f]{8}-/)

    const configPath = join(root, '.vault', 'config.json')
    const gravado = JSON.parse(await readFile(configPath, 'utf8')) as { vaultId?: string }
    expect(gravado.vaultId).toBe(primeiro)

    await session.close()
    await session.open(root)
    expect(session.config.vaultId).toBe(primeiro)
  })
})
