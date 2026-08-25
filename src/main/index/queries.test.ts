import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'
import {
  getNote, listNotes, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from './queries'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)

  await vault.writeAtomic('Segurança/MOC - Segurança.md',
    '---\ntipo: moc\n---\nchecklist de rate limiting')
  await vault.writeAtomic('Projetos/Nima.md',
    '---\ntipo: projeto\nproject: Nima\n---\nver [[MOC - Segurança]] e [[Fantasma]]')
  await vault.writeAtomic('Projetos/LCKP.md', '---\ntipo: projeto\nproject: LCKP\n---\noutro')
  await ix.syncAll()
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('queries', () => {
  it('getNote mapeia parse_error para parseError', () => {
    const n = getNote(db, 'Projetos/Nima.md')!
    expect(n.tipo).toBe('projeto')
    expect(n.title).toBe('Nima')
    expect(n.parseError).toBeNull()
  })

  it('getNote devolve undefined para caminho inexistente', () => {
    expect(getNote(db, 'nao/existe.md')).toBeUndefined()
  })

  it('listNotes filtra por tipo', () => {
    expect(listNotes(db, { tipo: 'projeto' }).map(r => r.title).sort()).toEqual(['LCKP', 'Nima'])
  })

  it('listNotes filtra por projeto', () => {
    expect(listNotes(db, { project: 'Nima' }).map(r => r.title)).toEqual(['Nima'])
  })

  it('listNotes sem filtro devolve tudo', () => {
    expect(listNotes(db).length).toBe(3)
  })

  it('searchFullText acha pelo corpo e devolve trecho', () => {
    const hits = searchFullText(db, 'limiting')
    expect(hits.map(h => h.path)).toEqual(['Segurança/MOC - Segurança.md'])
    expect(hits[0].snippet.toLowerCase()).toContain('limiting')
  })

  it('searchFullText respeita o limite', () => {
    expect(searchFullText(db, 'outro OR limiting OR ver', 1).length).toBe(1)
  })

  it('getBacklinks lista quem aponta para a nota', () => {
    expect(getBacklinks(db, 'Segurança/MOC - Segurança.md').map(b => b.path))
      .toEqual(['Projetos/Nima.md'])
  })

  it('getOutlinks lista os links de saída, resolvidos e quebrados', () => {
    const out = getOutlinks(db, 'Projetos/Nima.md')
    expect(out.map(o => o.dst).sort()).toEqual(['Fantasma', 'MOC - Segurança'])
    expect(out.find(o => o.dst === 'Fantasma')!.resolvedPath).toBeNull()
  })

  it('getBrokenLinks lista só os não resolvidos', () => {
    expect(getBrokenLinks(db)).toEqual([{ src: 'Projetos/Nima.md', dst: 'Fantasma', line: 1 }])
  })
})
