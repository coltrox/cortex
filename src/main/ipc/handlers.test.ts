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

  it('note:list-fields devolve campos reidratados', async () => {
    await handle(session, 'note:write', {
      path: 'Diario/2026-08-25.md',
      content: '---\ntipo: diario\ndate: 2026-08-25\npeso: 78.4\n---\n'
    })
    const notas = await handle(session, 'note:list-fields', { tipo: 'diario' }) as any[]
    expect(notas.length).toBe(1)
    expect(notas[0].campos.peso).toBe(78.4)
  })

  it('note:create cria e indexa imediatamente a nota nova', async () => {
    const r = await handle(session, 'note:create', {
      path: 'Notas/Nova.md', content: '---\ntipo: nota\n---\nconteúdo'
    }) as { path: string }
    expect(r.path).toBe('Notas/Nova.md')

    const read = await handle(session, 'note:read', { path: 'Notas/Nova.md' }) as { content: string }
    expect(read.content).toBe('---\ntipo: nota\n---\nconteúdo')

    const lista = await handle(session, 'note:list', { tipo: 'nota' }) as any[]
    expect(lista.map(n => n.path)).toContain('Notas/Nova.md')
  })

  it('note:create recusa sobrescrever arquivo existente e não altera o conteúdo original', async () => {
    await handle(session, 'note:write', { path: 'Notas/Existe.md', content: '---\ntipo: nota\n---\noriginal' })

    await expect(
      handle(session, 'note:create', { path: 'Notas/Existe.md', content: '---\ntipo: nota\n---\nnovo' })
    ).rejects.toThrow()

    const read = await handle(session, 'note:read', { path: 'Notas/Existe.md' }) as { content: string }
    expect(read.content).toBe('---\ntipo: nota\n---\noriginal')
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

describe('note:patch', () => {
  it('altera o frontmatter e preserva o corpo, reindexando na hora', async () => {
    await handle(session, 'note:write', {
      path: 'a.md',
      content: '---\ntipo: nota\nstatus: aberto\n---\n\nCorpo com acentuação e ção.\n'
    })

    const r = await handle(session, 'note:patch', {
      path: 'a.md', campos: { status: 'fechado', prioridade: 'alta' }
    }) as { path: string }
    expect(r.path).toBe('a.md')

    const read = await handle(session, 'note:read', { path: 'a.md' }) as { content: string }
    expect(read.content).toContain('Corpo com acentuação e ção.')
    expect(read.content).toContain('status: fechado')

    // reindexado imediatamente: note:list-fields reflete o campo novo
    const lista = await handle(session, 'note:list-fields', { tipo: 'nota' }) as any[]
    expect(lista[0].campos.prioridade).toBe('alta')
  })

  it('null em note:patch remove a chave', async () => {
    await handle(session, 'note:write', {
      path: 'a.md', content: '---\ntipo: nota\nstatus: aberto\n---\nx'
    })
    await handle(session, 'note:patch', { path: 'a.md', campos: { status: null } })
    const read = await handle(session, 'note:read', { path: 'a.md' }) as { content: string }
    expect(read.content).not.toContain('status:')
  })

  it('note:patch em YAML inválido lança e não altera o arquivo em disco', async () => {
    const original = '---\ntipo: [nao, fechado\n---\ncorpo original'
    await handle(session, 'note:write', { path: 'a.md', content: original })

    await expect(
      handle(session, 'note:patch', { path: 'a.md', campos: { status: 'x' } })
    ).rejects.toThrow()

    const read = await handle(session, 'note:read', { path: 'a.md' }) as { content: string }
    expect(read.content).toBe(original)
  })
})

describe('note:append', () => {
  it('acrescenta item a campo inexistente, criando a lista', async () => {
    await handle(session, 'note:write', { path: 'Diario/2026-08-25.md', content: '---\ntipo: diario\n---\n' })

    const r = await handle(session, 'note:append', {
      path: 'Diario/2026-08-25.md', campo: 'gastos', item: { valor: 10, desc: 'café' }
    }) as { path: string; total: number }
    expect(r.total).toBe(1)

    const lista = await handle(session, 'note:list-fields', { tipo: 'diario' }) as any[]
    expect(lista[0].campos.gastos).toEqual([{ valor: 10, desc: 'café' }])
  })

  it('duas chamadas simultâneas (Promise.all, sem await entre elas) resultam em 2 itens, não 1', async () => {
    await handle(session, 'note:write', { path: 'Diario/2026-08-25.md', content: '---\ntipo: diario\n---\n' })

    const [r1, r2] = await Promise.all([
      handle(session, 'note:append', {
        path: 'Diario/2026-08-25.md', campo: 'gastos', item: { valor: 10 }
      }) as Promise<{ total: number }>,
      handle(session, 'note:append', {
        path: 'Diario/2026-08-25.md', campo: 'gastos', item: { valor: 20 }
      }) as Promise<{ total: number }>
    ])

    // uma operação viu total 1, a outra viu total 2 (ordem entre elas não é
    // garantida, mas nenhum lançamento pode se perder)
    expect([r1.total, r2.total].sort()).toEqual([1, 2])

    const read = await handle(session, 'note:read', { path: 'Diario/2026-08-25.md' }) as { content: string }
    const lista = await handle(session, 'note:list-fields', { tipo: 'diario' }) as any[]
    expect(lista[0].campos.gastos.length).toBe(2)
    expect(read.content).toMatch(/valor: 10/)
    expect(read.content).toMatch(/valor: 20/)
  })
})

describe('note:ensure', () => {
  it('nota inexistente: cria, indexa e devolve criada: true', async () => {
    const r = await handle(session, 'note:ensure', {
      path: 'Diario/2026-08-25.md', conteudoInicial: '---\ntipo: diario\ndate: 2026-08-25\n---\n'
    }) as { path: string; criada: boolean }
    expect(r.criada).toBe(true)

    const lista = await handle(session, 'note:list', { tipo: 'diario' }) as any[]
    expect(lista.map(n => n.path)).toEqual(['Diario/2026-08-25.md'])
  })

  it('nota existente: não altera o conteúdo e devolve criada: false', async () => {
    const original = '---\ntipo: diario\n---\nconteúdo original já escrito pela pessoa'
    await handle(session, 'note:write', { path: 'Diario/2026-08-25.md', content: original })

    const r = await handle(session, 'note:ensure', {
      path: 'Diario/2026-08-25.md', conteudoInicial: '---\ntipo: diario\n---\nOUTRO CONTEÚDO'
    }) as { path: string; criada: boolean }
    expect(r.criada).toBe(false)

    const read = await handle(session, 'note:read', { path: 'Diario/2026-08-25.md' }) as { content: string }
    expect(read.content).toBe(original)
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

describe('note:delete e note:move', () => {
  it('apaga a nota do disco e do indice', async () => {
    await handle(session, 'note:write', { path: 'x.md', content: '---\ntipo: nota\n---\noi' })
    expect((await handle(session, 'note:list', {}) as any[]).length).toBe(1)
    await handle(session, 'note:delete', { path: 'x.md' })
    expect(await session.vault.exists('x.md')).toBe(false)
    expect((await handle(session, 'note:list', {}) as any[]).length).toBe(0)
  })

  it('apagar duas vezes nao quebra', async () => {
    await handle(session, 'note:write', { path: 'x.md', content: 'oi' })
    await handle(session, 'note:delete', { path: 'x.md' })
    await expect(handle(session, 'note:delete', { path: 'x.md' })).resolves.toBeTruthy()
  })

  it('mover leva o conteudo e reindexa no caminho novo', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: '---\ntipo: nota\n---\ncorpo' })
    await handle(session, 'note:move', { de: 'a.md', para: 'Pasta/b.md' })
    const r = await handle(session, 'note:read', { path: 'Pasta/b.md' }) as { content: string }
    expect(r.content).toContain('corpo')
    const lista = await handle(session, 'note:list', {}) as any[]
    expect(lista.map(n => n.path)).toEqual(['Pasta/b.md'])
  })

  it('mover recusa sobrescrever uma nota que ja existe', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: 'A' })
    await handle(session, 'note:write', { path: 'b.md', content: 'B' })
    await expect(handle(session, 'note:move', { de: 'a.md', para: 'b.md' })).rejects.toThrow()
    const r = await handle(session, 'note:read', { path: 'b.md' }) as { content: string }
    expect(r.content).toBe('B')
  })

  it('apagar corrige o link de quem apontava para a nota', async () => {
    await handle(session, 'note:write', { path: 'alvo.md', content: 'sou o alvo' })
    await handle(session, 'note:write', { path: 'origem.md', content: 'veja [[alvo]]' })
    const antes = await handle(session, 'links:outlinks', { path: 'origem.md' }) as any[]
    expect(antes[0].resolvedPath).toBe('alvo.md')

    await handle(session, 'note:delete', { path: 'alvo.md' })
    const depois = await handle(session, 'links:outlinks', { path: 'origem.md' }) as any[]
    expect(depois[0].resolvedPath).toBeNull()
  })
})

describe('folder e config', () => {
  it('cria pasta e ela aparece na listagem', async () => {
    await handle(session, 'folder:create', { pasta: 'Dev/Projetos' })
    const pastas = await handle(session, 'folder:list', {}) as string[]
    expect(pastas).toContain('Dev')
    expect(pastas).toContain('Dev/Projetos')
  })

  it('folder:list nao mostra .vault', async () => {
    const pastas = await handle(session, 'folder:list', {}) as string[]
    expect(pastas.some(p => p.startsWith('.'))).toBe(false)
  })

  it('salvar areas cria as pastas correspondentes', async () => {
    await handle(session, 'config:areas', { areas: ['saude'] })
    const pastas = await handle(session, 'folder:list', {}) as string[]
    expect(pastas).toContain('Saude')
    expect(pastas).toContain('Saude/Treinos')
    expect(pastas).toContain('Diario')
    expect(pastas).not.toContain('Grana')
  })

  it('area inventada pelo renderer nao e persistida', async () => {
    const c = await handle(session, 'config:areas', { areas: ['vida', 'hackeado'] }) as any
    expect(c.areas).toEqual(['vida'])
  })

  it('config:get devolve o que foi salvo', async () => {
    await handle(session, 'config:areas', { areas: ['dev'] })
    const c = await handle(session, 'config:get', {}) as any
    expect(c.areas).toEqual(['dev'])
  })
})

describe('dev — confinamento pela lista autorizada', () => {
  it('recusa uma raiz que o renderer inventou', async () => {
    await expect(handle(session, 'dev:tree', { raiz: root, sub: '' })).rejects.toThrow(/autorizada/)
  })

  it('dev:folders comeca vazio', async () => {
    expect(await handle(session, 'dev:folders', {})).toEqual([])
  })

  it('so enxerga a pasta depois de ela entrar na config', async () => {
    await session.salvarConfig({ pastasDev: [root] })
    const itens = await handle(session, 'dev:tree', { raiz: root, sub: '' }) as any[]
    expect(Array.isArray(itens)).toBe(true)
    await handle(session, 'dev:remove-folder', { raiz: root })
    await expect(handle(session, 'dev:tree', { raiz: root, sub: '' })).rejects.toThrow(/autorizada/)
  })
})
