import type { WikiLink } from '../../shared/types'

const LINK = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

/** Substitui trechos de código por espaços, preservando posições e quebras de linha. */
function blankOutCode(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, m => m.replace(/[^\n\r]/g, ' '))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length))
}

export function extractWikiLinks(body: string): WikiLink[] {
  const out: WikiLink[] = []
  const lines = blankOutCode(body).split(/\r\n|\n/)
  lines.forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      const link: WikiLink = { target: m[1].trim(), line: i + 1 }
      if (m[3]) link.alias = m[3].trim()
      if (m[2]) link.anchor = m[2].trim()
      out.push(link)
    }
  })
  return out
}
