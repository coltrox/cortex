import Database from 'better-sqlite3'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'

export { SCHEMA_VERSION }
export type Db = Database.Database

export function openIndex(dbPath: string): Db {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  db.prepare("INSERT INTO meta (key,value) VALUES ('schema_version',?) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(SCHEMA_VERSION))
  return db
}
