import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SCHEMA_VERSION } from '../index/db'
import { IPC_SCHEMAS } from '../../shared/ipc'
import { Session } from '../session'
import { handle } from './handlers'

let root: string, session: Session

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  session = new Session()
  await session.open(root)
})
afterEach(async () => { await session.close(); await rm(root, { recursive: true, force: true }) })

describe('handle', () => {
  it('escreve e lê uma nota', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: '# oi' })
    const r = await handle(session, 'note:read', { path: 'a.md' }) as { content: string }
    expect(r.content).toBe('# oi')
  })

  it('indexa imediatamente após escrever', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: '---\ntipo: projeto\n---\nx' })
    const lista = await handle(session, 'note:list', { tipo: 'projeto' }) as any[]
    expect(lista.map(n => n.path)).toEqual(['a.md'])
  })

  it('rejeita payload inválido antes de tocar no disco', async () => {
    await expect(handle(session, 'note:read', { path: '' })).rejects.toThrow(/inválido/i)
  })

  it('rejeita path traversal (agora barrado já no schema, por segmento começando com ".")', async () => {
    await expect(
      handle(session, 'note:read', { path: '../../fora.md' })
    ).rejects.toThrow(/inválido/i)
  })

  it('note:write + note:read fazem round-trip com um caminho POSIX .md normal (Projetos/Nima.md)', async () => {
    await handle(session, 'note:write', { path: 'Projetos/Nima.md', content: '# nima' })
    const r = await handle(session, 'note:read', { path: 'Projetos/Nima.md' }) as { content: string }
    expect(r.content).toBe('# nima')
  })

  it('rejeita escritas fora do contrato .md (ex.: .vault/index.db, Anexos/contrato.pdf, path com "\\")', async () => {
    await expect(
      handle(session, 'note:write', { path: '.vault/index.db', content: '' })
    ).rejects.toThrow(/inválido/i)
    await expect(
      handle(session, 'note:write', { path: 'a/../.vault/index.db', content: '' })
    ).rejects.toThrow(/inválido/i)
    await expect(
      handle(session, 'note:write', { path: 'Anexos/contrato.pdf', content: 'x' })
    ).rejects.toThrow(/inválido/i)
    await expect(
      handle(session, 'note:write', { path: 'Projetos\\Nima.md', content: 'x' })
    ).rejects.toThrow(/inválido/i)
  })

  it('links:backlinks e links:outlinks continuam funcionando com paths reais de notes.path (tightening não quebra)', async () => {
    await handle(session, 'note:write', { path: 'A.md', content: '[[B]]' })
    await handle(session, 'note:write', { path: 'B.md', content: 'sem links' })
    const back = await handle(session, 'links:backlinks', { path: 'B.md' }) as { path: string }[]
    const out = await handle(session, 'links:outlinks', { path: 'A.md' }) as { dst: string }[]
    expect(back.map(r => r.path)).toEqual(['A.md'])
    expect(out.map(r => r.dst)).toEqual(['B'])
  })

  it('rejeita canal desconhecido', async () => {
    await expect(handle(session, 'canal:falso' as any, {})).rejects.toThrow(/desconhecido/)
  })

  it('busca full-text encontra a nota escrita', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: 'rate limiting no login' })
    const hits = await handle(session, 'search:fulltext', { q: 'limiting' }) as any[]
    expect(hits.map(h => h.path)).toEqual(['a.md'])
  })

  // CRITICAL da revisão: escolher a raiz do vault é ação privilegiada — só o
  // main decide, e só via diálogo nativo (`pickVault`, Task 11). `vault:open`
  // deixaria o renderer nomear qualquer diretório do disco como "vault", o que
  // torna toda a confinação de `Vault.toAbsolute` inútil (ela mede distância a
  // partir de uma raiz que o próprio atacante escolheu). O canal não existe
  // mais na superfície IPC.
  it('vault:open não é alcançável pelo renderer', async () => {
    await expect(handle(session, 'vault:open' as any, { root: 'C:\\qualquer' }))
      .rejects.toThrow(/desconhecido/)
  })

  it('vault:open não é chave de IPC_SCHEMAS', () => {
    expect(Object.keys(IPC_SCHEMAS)).not.toContain('vault:open')
  })
})

describe('Session.open — reconstrução do índice (ADENDO)', () => {
  it('versão antiga: reconstrói e schema_version volta a ser SCHEMA_VERSION', async () => {
    await session.close()
    const dbPath = join(root, '.vault', 'index.db')
    const raw = new Database(dbPath)
    raw.prepare("UPDATE meta SET value = '0' WHERE key = 'schema_version'").run()
    raw.close()

    session = new Session()
    await expect(session.open(root)).resolves.not.toThrow()

    const row = session.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as
      { value: string } | undefined
    expect(Number(row?.value)).toBe(SCHEMA_VERSION)
  })

  it('arquivo corrompido: reconstrói e fica utilizável', async () => {
    await session.close()
    const dbPath = join(root, '.vault', 'index.db')
    await writeFile(dbPath, 'nao sou um banco')

    session = new Session()
    await expect(session.open(root)).resolves.not.toThrow()

    await handle(session, 'note:write', { path: 'a.md', content: '---\ntipo: nota\n---\nx' })
    const lista = await handle(session, 'note:list', {}) as any[]
    expect(lista.map(n => n.path)).toEqual(['a.md'])
  })

  it('caso feliz preservado: reabrir não reconstrói o índice sem motivo', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: '---\ntipo: nota\n---\nx' })

    // Marcador gravado diretamente no banco, sem correspondente em disco.
    // `syncAll()` reindexa os .md a cada `open()` independentemente de o banco
    // ter sido reconstruído ou não — por isso `note:list` sozinho não prova
    // nada aqui (um rebuild incondicional passaria despercebido, já que os
    // arquivos ainda estão no vault e seriam reindexados do zero). Este
    // marcador só sobrevive se o ARQUIVO do banco não for apagado.
    session.db.prepare(
      "INSERT INTO meta (key,value) VALUES ('teste_marcador','presente')"
    ).run()

    await session.close()

    session = new Session()
    await session.open(root)

    const lista = await handle(session, 'note:list', {}) as any[]
    expect(lista.map(n => n.path)).toEqual(['a.md'])

    const marcador = session.db.prepare(
      "SELECT value FROM meta WHERE key='teste_marcador'"
    ).get() as { value: string } | undefined
    expect(marcador?.value).toBe('presente')
  })
})
