import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openIndex, SCHEMA_VERSION } from './db'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

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

  it('é idempotente: reabrir um banco em arquivo já populado não quebra nem perde dados', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cortex-index-'))
    const dbPath = join(tmpDir, 'index.db')

    const db1 = openIndex(dbPath)
    expect(db1.pragma('journal_mode', { simple: true })).toBe('wal')
    db1.prepare('INSERT INTO notes (path,title,tipo,mtime,size) VALUES (?,?,?,?,?)')
      .run('a.md', 'Nima', 'projeto', 1, 1)
    db1.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)')
      .run('a.md', 'Nima', 'rate limiting no login')
    db1.close()

    let db2: ReturnType<typeof openIndex> | undefined
    expect(() => { db2 = openIndex(dbPath) }).not.toThrow()

    const row = db2!.prepare('SELECT path,title FROM notes WHERE path = ?').get('a.md')
    expect(row).toEqual({ path: 'a.md', title: 'Nima' })

    const metaRow = db2!.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as any
    expect(Number(metaRow.value)).toBe(SCHEMA_VERSION)

    db2!.close()
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
