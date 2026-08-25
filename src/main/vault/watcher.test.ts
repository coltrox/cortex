import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from './vault'
import { VaultWatcher } from './watcher'
import { openIndex, type Db } from '../index/db'
import { Indexer } from '../index/indexer'

let root: string, vault: Vault, db: Db, ix: Indexer, w: VaultWatcher
const eventos: { rel: string; kind: string }[] = []

const esperar = (cond: () => boolean, ms = 5000) => new Promise<void>((ok, fail) => {
  const t0 = Date.now()
  const tick = (): void => {
    if (cond()) return ok()
    if (Date.now() - t0 > ms) return fail(new Error('timeout esperando o watcher'))
    setTimeout(tick, 50)
  }
  tick()
})

beforeEach(async () => {
  eventos.length = 0
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
  w = new VaultWatcher(vault, ix, db, (rel, kind) => eventos.push({ rel, kind }))
  await w.start()
})
afterEach(async () => { await w.stop(); await rm(root, { recursive: true, force: true }) })

describe('VaultWatcher', () => {
  it('indexa nota criada por fora do app', async () => {
    await vault.writeAtomic('novo.md', '---\ntipo: nota\n---\ncriado por fora')
    await esperar(() => eventos.some(e => e.rel === 'novo.md'))
    const n = db.prepare('SELECT tipo FROM notes WHERE path=?').get('novo.md') as any
    expect(n.tipo).toBe('nota')
  })

  it('reindexa nota alterada por fora', async () => {
    await vault.writeAtomic('a.md', '[[Antes]]')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    eventos.length = 0
    await vault.writeAtomic('a.md', '[[Depois]]')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    expect(db.prepare('SELECT dst FROM links WHERE src=?').all('a.md')).toEqual([{ dst: 'Depois' }])
  })

  it('remove do índice nota apagada por fora', async () => {
    await vault.writeAtomic('a.md', 'x')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    await rm(join(root, 'a.md'))
    await esperar(() => eventos.some(e => e.kind === 'unlink'))
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })

  it('não emite evento para arquivo que não é .md', async () => {
    await writeFile(join(root, 'imagem.png'), 'x')
    await new Promise(r => setTimeout(r, 800))
    expect(eventos.some(e => e.rel.endsWith('.png'))).toBe(false)
  })

  it('resolve o link ao indexar e limpa resolved_path ao apagar o alvo (unlink chama resolveLinks)', async () => {
    await vault.writeAtomic('alvo.md', 'conteúdo do alvo')
    await vault.writeAtomic('origem.md', '[[alvo]]')
    await esperar(() => eventos.some(e => e.rel === 'alvo.md') && eventos.some(e => e.rel === 'origem.md'))

    const antes = db.prepare('SELECT resolved_path FROM links WHERE src=?').get('origem.md') as any
    expect(antes.resolved_path).toBe('alvo.md')

    await rm(join(root, 'alvo.md'))
    await esperar(() => eventos.some(e => e.kind === 'unlink'))

    const depois = db.prepare('SELECT resolved_path FROM links WHERE src=?').get('origem.md') as any
    expect(depois.resolved_path).toBeNull()
  })
})
