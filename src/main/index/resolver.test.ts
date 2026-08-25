import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'
import { resolveLinks } from './resolver'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const resolved = (src: string) =>
  db.prepare('SELECT dst,resolved_path FROM links WHERE src=?').all(src) as any[]

describe('resolveLinks', () => {
  it('resolve pelo nome do arquivo, em qualquer pasta', async () => {
    await vault.writeAtomic('Segurança/MOC - Segurança.md', 'x')
    await vault.writeAtomic('Projetos/Nima.md', 'ver [[MOC - Segurança]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('Projetos/Nima.md')[0].resolved_path).toBe('Segurança/MOC - Segurança.md')
  })

  it('resolve por caminho completo quando informado', async () => {
    await vault.writeAtomic('Projetos/Nima.md', 'x')
    await vault.writeAtomic('a.md', 'ver [[Projetos/Nima]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBe('Projetos/Nima.md')
  })

  it('ignora diferença de maiúsculas', async () => {
    await vault.writeAtomic('Nima.md', 'x')
    await vault.writeAtomic('a.md', '[[nima]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBe('Nima.md')
  })

  it('deixa NULL quando a nota não existe', async () => {
    await vault.writeAtomic('a.md', '[[Fantasma]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBeNull()
  })

  it('link quebrado passa a resolver quando a nota é criada', async () => {
    await vault.writeAtomic('a.md', '[[Depois]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBeNull()

    await vault.writeAtomic('Depois.md', 'x')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBe('Depois.md')
  })

  it('nome ambíguo (mesmo basename em duas pastas) resolve para o mesmo alvo em reindexações sucessivas', async () => {
    await vault.writeAtomic('Segurança/Nima.md', 'x')
    await vault.writeAtomic('Projetos/Nima.md', 'x')
    await vault.writeAtomic('a.md', '[[Nima]]')
    await ix.syncAll()
    resolveLinks(db)
    const primeiro = resolved('a.md')[0].resolved_path

    // Reindexação completa (simula reabrir o app): sem ORDER BY na query do
    // resolver, a ordem de varredura do SQLite não é garantida entre
    // execuções, e o alvo escolhido para o nome ambíguo poderia mudar.
    await ix.syncAll()
    resolveLinks(db)
    const segundo = resolved('a.md')[0].resolved_path

    expect(primeiro).toBe('Projetos/Nima.md') // alfabeticamente primeiro
    expect(segundo).toBe(primeiro)
  })

  it('resolve todos os links de uma nota com vários, não só o primeiro', async () => {
    await vault.writeAtomic('B.md', 'x')
    await vault.writeAtomic('C.md', 'x')
    await vault.writeAtomic(
      'a.md',
      '[[B]] [[C]] [[Fantasma1]] [[Fantasma2]]'
    )
    await ix.syncAll()
    resolveLinks(db)
    const rows = resolved('a.md')
    expect(rows).toHaveLength(4)
    expect(rows.filter(r => r.resolved_path !== null)).toHaveLength(2)
    expect(rows.filter(r => r.resolved_path === null)).toHaveLength(2)
  })
})
