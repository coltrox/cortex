import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { Db } from './db'
import type { Vault } from '../vault/vault'
import { parseNote } from '../parser'
import { resolveLinks } from './resolver'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export class Indexer {
  constructor(private db: Db, private vault: Vault) {}

  private clear(rel: string): void {
    this.db.prepare('DELETE FROM notes WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM note_tags WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM links WHERE src = ?').run(rel)
    this.db.prepare('DELETE FROM tasks WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM fields WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM notes_fts WHERE path = ?').run(rel)
  }

  removeFile(rel: string): void {
    this.db.transaction(() => this.clear(rel))()
  }

  async indexFile(rel: string): Promise<void> {
    const raw = await this.vault.read(rel)
    const { mtimeMs, size } = await this.vault.stat(rel)
    const note = parseNote(raw)
    const fm = note.frontmatter

    const title = asString(fm.titulo) ?? asString(fm.title) ?? basename(rel, '.md')
    const hash = createHash('sha1').update(note.body).digest('hex')

    this.db.transaction(() => {
      this.clear(rel)

      this.db.prepare(`INSERT INTO notes
        (path,title,tipo,project,status,created,updated,date,mtime,size,body_hash,parse_error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        rel, title,
        asString(fm.tipo) ?? 'nota',
        asString(fm.project), asString(fm.status),
        asString(fm.created), asString(fm.updated), asString(fm.date),
        mtimeMs, size, hash, note.parseError
      )

      const tags = Array.isArray(fm.tags) ? fm.tags : []
      const insTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (path,tag) VALUES (?,?)')
      for (const t of tags) if (typeof t === 'string') insTag.run(rel, t)

      const insLink = this.db.prepare(
        'INSERT INTO links (src,dst,resolved_path,line) VALUES (?,?,NULL,?)')
      for (const l of note.links) insLink.run(rel, l.target, l.line)

      const insTask = this.db.prepare(
        'INSERT OR REPLACE INTO tasks (path,line,text,done,due) VALUES (?,?,?,?,?)')
      for (const t of note.tasks) insTask.run(rel, t.line, t.text, t.done ? 1 : 0, t.due ?? null)

      const insField = this.db.prepare(
        'INSERT INTO fields (path,key,value_text,value_num,value_date) VALUES (?,?,?,?,?)')
      for (const [key, value] of Object.entries(fm)) {
        if (typeof value === 'number') insField.run(rel, key, null, value, null)
        else if (typeof value === 'string' && ISO_DATE.test(value)) insField.run(rel, key, null, null, value)
        else if (typeof value === 'string') insField.run(rel, key, value, null, null)
        else insField.run(rel, key, JSON.stringify(value), null, null)
      }

      this.db.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)')
        .run(rel, title, note.body)
    })()

    resolveLinks(this.db)
  }

  async syncAll(): Promise<{ indexed: number; removed: number; skipped: number }> {
    const onDisk = await this.vault.listMarkdown()
    const known = new Map(
      (this.db.prepare('SELECT path,mtime,size FROM notes').all() as any[])
        .map(r => [r.path as string, r])
    )

    let indexed = 0, skipped = 0
    for (const rel of onDisk) {
      const prev = known.get(rel)
      const { mtimeMs, size } = await this.vault.stat(rel)
      if (prev && prev.mtime === mtimeMs && prev.size === size) { skipped++; continue }
      await this.indexFile(rel)
      indexed++
    }

    let removed = 0
    const present = new Set(onDisk)
    for (const rel of known.keys()) {
      if (!present.has(rel)) { this.removeFile(rel); removed++ }
    }

    resolveLinks(this.db)

    return { indexed, removed, skipped }
  }
}
