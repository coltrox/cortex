export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nota',
  project TEXT,
  status TEXT,
  created TEXT,
  updated TEXT,
  date TEXT,
  mtime REAL NOT NULL,
  size INTEGER NOT NULL,
  body_hash TEXT,
  parse_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_notes_tipo ON notes(tipo);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);

CREATE TABLE IF NOT EXISTS note_tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON note_tags(tag);

CREATE TABLE IF NOT EXISTS links (
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  resolved_path TEXT,
  line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src);
CREATE INDEX IF NOT EXISTS idx_links_resolved ON links(resolved_path);

CREATE TABLE IF NOT EXISTS tasks (
  path TEXT NOT NULL,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL,
  due TEXT,
  PRIMARY KEY (path, line)
);

CREATE TABLE IF NOT EXISTS fields (
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  value_text TEXT,
  value_num REAL,
  value_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_fields_key ON fields(key);
CREATE INDEX IF NOT EXISTS idx_fields_path ON fields(path);

CREATE TABLE IF NOT EXISTS checklist_state (
  project TEXT NOT NULL,
  item_id TEXT NOT NULL,
  done INTEGER NOT NULL,
  updated TEXT NOT NULL,
  PRIMARY KEY (project, item_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(path, title, body);
`
