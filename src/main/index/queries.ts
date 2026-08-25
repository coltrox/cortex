import type { Db } from './db'
import type { NoteRow } from '../../shared/types'

const NOTE_COLS = `path, title, tipo, project, status, created, updated, date,
  mtime, size, parse_error as parseError`

export function getNote(db: Db, path: string): NoteRow | undefined {
  return db.prepare(`SELECT ${NOTE_COLS} FROM notes WHERE path = ?`).get(path) as NoteRow | undefined
}

export function listNotes(db: Db, filter: { tipo?: string; project?: string } = {}): NoteRow[] {
  const where: string[] = []
  const args: string[] = []
  if (filter.tipo) { where.push('tipo = ?'); args.push(filter.tipo) }
  if (filter.project) { where.push('project = ?'); args.push(filter.project) }
  const sql = `SELECT ${NOTE_COLS} FROM notes
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY title COLLATE NOCASE`
  return db.prepare(sql).all(...args) as NoteRow[]
}

export function searchFullText(
  db: Db, q: string, limit = 50
): { path: string; title: string; snippet: string }[] {
  return db.prepare(`
    SELECT path, title, snippet(notes_fts, 2, '«', '»', '…', 12) AS snippet
    FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?
  `).all(q, limit) as { path: string; title: string; snippet: string }[]
}

export function getBacklinks(
  db: Db, path: string
): { path: string; title: string; line: number }[] {
  return db.prepare(`
    SELECT l.src AS path, n.title AS title, l.line AS line
    FROM links l JOIN notes n ON n.path = l.src
    WHERE l.resolved_path = ?
    ORDER BY n.title COLLATE NOCASE
  `).all(path) as { path: string; title: string; line: number }[]
}

export function getOutlinks(
  db: Db, path: string
): { dst: string; resolvedPath: string | null; line: number }[] {
  return db.prepare(`
    SELECT dst, resolved_path AS resolvedPath, line FROM links WHERE src = ? ORDER BY line
  `).all(path) as { dst: string; resolvedPath: string | null; line: number }[]
}

export function getBrokenLinks(db: Db): { src: string; dst: string; line: number }[] {
  return db.prepare(`
    SELECT src, dst, line FROM links WHERE resolved_path IS NULL ORDER BY src, line
  `).all() as { src: string; dst: string; line: number }[]
}
