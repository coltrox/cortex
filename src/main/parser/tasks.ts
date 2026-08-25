import type { TaskItem } from '../../shared/types'

const TASK = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/
const DUE = /📅\s*(\d{4}-\d{2}-\d{2})/

export function extractTasks(body: string): TaskItem[] {
  const out: TaskItem[] = []
  body.split(/\r\n|\n/).forEach((line, i) => {
    const m = line.match(TASK)
    if (!m) return
    let text = m[2].trim()
    const due = text.match(DUE)?.[1]
    if (due) text = text.replace(DUE, '').trim()
    const task: TaskItem = { text, done: m[1].toLowerCase() === 'x', line: i + 1 }
    if (due) task.due = due
    out.push(task)
  })
  return out
}
