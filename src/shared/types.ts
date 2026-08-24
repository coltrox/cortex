export interface WikiLink {
  target: string
  alias?: string
  anchor?: string
  line: number
}

export interface TaskItem {
  text: string
  done: boolean
  line: number
  due?: string
}

export interface ParsedNote {
  frontmatter: Record<string, unknown>
  body: string
  parseError: string | null
  links: WikiLink[]
  tasks: TaskItem[]
}

export interface NoteRow {
  path: string
  title: string
  tipo: string
  project: string | null
  status: string | null
  created: string | null
  updated: string | null
  date: string | null
  mtime: number
  size: number
  parseError: string | null
}
