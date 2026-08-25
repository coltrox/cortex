import type { ParsedNote } from '../../shared/types'
import { parseFrontmatter } from './frontmatter'
import { extractWikiLinks } from './wikilinks'
import { extractTasks } from './tasks'

export { parseFrontmatter, extractWikiLinks, extractTasks }

export function parseNote(raw: string): ParsedNote {
  const { frontmatter, body, parseError } = parseFrontmatter(raw)
  return {
    frontmatter,
    body,
    parseError,
    links: extractWikiLinks(body),
    tasks: extractTasks(body)
  }
}
