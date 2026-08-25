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
})
