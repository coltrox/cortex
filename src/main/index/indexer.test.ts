import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const NOTA = `---
tipo: projeto
project: Nima
tags: [tech, seguranca]
created: 2026-08-02
date: 2026-09-02
---

Ver [[MOC - Segurança]].

- [ ] rate limiting
`

describe('Indexer', () => {
  it('indexa uma nota com metadados, tags, links e tarefas', async () => {
    await vault.writeAtomic('Projetos/Nima.md', NOTA)
    await ix.indexFile('Projetos/Nima.md')

    const note = db.prepare('SELECT * FROM notes WHERE path=?').get('Projetos/Nima.md') as any
    expect(note.tipo).toBe('projeto')
    expect(note.project).toBe('Nima')
    expect(note.date).toBe('2026-09-02')
    expect(note.title).toBe('Nima')

    const tags = db.prepare('SELECT tag FROM note_tags WHERE path=? ORDER BY tag')
      .all('Projetos/Nima.md')
    expect(tags).toEqual([{ tag: 'seguranca' }, { tag: 'tech' }])

    const links = db.prepare('SELECT dst FROM links WHERE src=?').all('Projetos/Nima.md')
    expect(links).toEqual([{ dst: 'MOC - Segurança' }])

    const tasks = db.prepare('SELECT text, done FROM tasks WHERE path=?').all('Projetos/Nima.md')
    expect(tasks).toEqual([{ text: 'rate limiting', done: 0 }])
  })

  it('usa tipo "nota" quando o frontmatter não tem tipo', async () => {
    await vault.writeAtomic('a.md', 'só texto')
    await ix.indexFile('a.md')
    const note = db.prepare('SELECT tipo FROM notes WHERE path=?').get('a.md') as any
    expect(note.tipo).toBe('nota')
  })

  it('grava campos arbitrários em fields, separando número, data e texto', async () => {
    await vault.writeAtomic('t.md', `---
tipo: treino
date: 2026-08-24
peso: 78.4
grupo: peito
---
x`)
    await ix.indexFile('t.md')
    const rows = db.prepare('SELECT key,value_text,value_num,value_date FROM fields WHERE path=?')
      .all('t.md') as any[]
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]))
    expect(byKey.peso.value_num).toBe(78.4)
    expect(byKey.grupo.value_text).toBe('peito')
    expect(byKey.date.value_date).toBe('2026-08-24')
  })

  it('reindexar substitui, não duplica', async () => {
    await vault.writeAtomic('a.md', '[[X]]')
    await ix.indexFile('a.md')
    await vault.writeAtomic('a.md', '[[Y]]')
    await ix.indexFile('a.md')
    const links = db.prepare('SELECT dst FROM links WHERE src=?').all('a.md')
    expect(links).toEqual([{ dst: 'Y' }])
    const n = db.prepare('SELECT count(*) c FROM notes').get() as any
    expect(n.c).toBe(1)
  })

  it('guarda parse_error sem derrubar a indexação', async () => {
    await vault.writeAtomic('bad.md', `---
tipo: [quebrado
---
[[Nima]]`)
    await ix.indexFile('bad.md')
    const note = db.prepare('SELECT parse_error FROM notes WHERE path=?').get('bad.md') as any
    expect(note.parse_error).not.toBeNull()
    const links = db.prepare('SELECT dst FROM links WHERE src=?').all('bad.md')
    expect(links).toEqual([{ dst: 'Nima' }])
  })

  it('removeFile apaga a nota e tudo que depende dela', async () => {
    await vault.writeAtomic('a.md', '[[X]]\n- [ ] t')
    await ix.indexFile('a.md')
    ix.removeFile('a.md')
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT count(*) c FROM links').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT count(*) c FROM tasks').get()).toEqual({ c: 0 })
  })

  it('syncAll pula arquivos não modificados', async () => {
    await vault.writeAtomic('a.md', 'x')
    const first = await ix.syncAll()
    expect(first.indexed).toBe(1)
    const second = await ix.syncAll()
    expect(second.indexed).toBe(0)
    expect(second.skipped).toBe(1)
  })

  it('syncAll remove do índice nota apagada do disco', async () => {
    await vault.writeAtomic('a.md', 'x')
    await ix.syncAll()
    await rm(join(root, 'a.md'))
    const r = await ix.syncAll()
    expect(r.removed).toBe(1)
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })
})
