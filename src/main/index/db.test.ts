import { describe, it, expect } from 'vitest'
import { openIndex, SCHEMA_VERSION } from './db'

describe('openIndex', () => {
  it('cria todas as tabelas em banco em memória', () => {
    const db = openIndex(':memory:')
    const names = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map((r: any) => r.name)
    for (const t of ['notes', 'note_tags', 'links', 'tasks', 'fields', 'checklist_state', 'meta']) {
      expect(names).toContain(t)
    }
  })

  it('grava a versão do schema', () => {
    const db = openIndex(':memory:')
    const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as any
    expect(Number(row.value)).toBe(SCHEMA_VERSION)
  })

  it('é idempotente: abrir duas vezes não quebra', () => {
    const db = openIndex(':memory:')
    expect(() => openIndex(':memory:')).not.toThrow()
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })

  it('busca full-text funciona pela tabela FTS', () => {
    const db = openIndex(':memory:')
    db.prepare('INSERT INTO notes (path,title,tipo,mtime,size) VALUES (?,?,?,?,?)')
      .run('a.md', 'Nima', 'projeto', 1, 1)
    db.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)')
      .run('a.md', 'Nima', 'rate limiting no login')
    const hits = db.prepare("SELECT path FROM notes_fts WHERE notes_fts MATCH 'limiting'").all()
    expect(hits).toEqual([{ path: 'a.md' }])
  })
})
