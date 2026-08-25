import { describe, it, expect } from 'vitest'
import { parseNote } from './index'

describe('parseNote', () => {
  it('junta frontmatter, links e tarefas', () => {
    const raw = `---
tipo: projeto
project: Nima
---

Ver [[MOC - Segurança]].

- [ ] rate limiting`
    const n = parseNote(raw)
    expect(n.parseError).toBeNull()
    expect(n.frontmatter.tipo).toBe('projeto')
    expect(n.links.map(l => l.target)).toEqual(['MOC - Segurança'])
    expect(n.tasks[0].text).toBe('rate limiting')
  })

  it('com YAML inválido ainda extrai links do corpo', () => {
    const raw = `---
tipo: [quebrado
---
[[Nima]]`
    const n = parseNote(raw)
    expect(n.parseError).not.toBeNull()
    expect(n.links.map(l => l.target)).toEqual(['Nima'])
  })
})
