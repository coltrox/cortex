import type { Db } from './db'

/**
 * Preenche links.resolved_path. Recalcula tudo: é barato no tamanho de vault
 * esperado (milhares de notas) e elimina estado inconsistente entre reindexações.
 */
export function resolveLinks(db: Db): void {
  const paths = (db.prepare('SELECT path FROM notes ORDER BY path').all() as { path: string }[]).map(r => r.path)

  const byFull = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const p of paths) {
    const noExt = p.replace(/\.md$/i, '')
    byFull.set(noExt.toLowerCase(), p)
    const name = noExt.split('/').pop()!.toLowerCase()
    if (!byName.has(name)) byName.set(name, p)
  }

  const upd = db.prepare('UPDATE links SET resolved_path = ? WHERE rowid = ?')
  const rows = db.prepare('SELECT rowid, dst FROM links').all() as { rowid: number; dst: string }[]

  db.transaction(() => {
    for (const { rowid, dst } of rows) {
      const key = dst.replace(/\.md$/i, '').toLowerCase()
      upd.run(byFull.get(key) ?? byName.get(key) ?? null, rowid)
    }
  })()
}
