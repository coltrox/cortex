import matter from 'gray-matter'

function isoDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(isoDates)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, isoDates(v)])
    )
  }
  return value
}

export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>
  body: string
  parseError: string | null
} {
  try {
    const parsed = matter(raw, {})
    return {
      frontmatter: isoDates(parsed.data) as Record<string, unknown>,
      body: parsed.content,
      parseError: null
    }
  } catch (err) {
    // YAML inválido não pode derrubar a indexação: devolve o texto cru.
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    return { frontmatter: {}, body, parseError: (err as Error).message }
  }
}
