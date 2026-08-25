import { describe, it, expect } from 'vitest'
import type { ParsedNote } from './types'

describe('tipos compartilhados', () => {
  it('aceita uma nota parseada mínima', () => {
    const nota: ParsedNote = {
      frontmatter: { tipo: 'nota' },
      body: 'oi',
      parseError: null,
      links: [],
      tasks: []
    }
    expect(nota.frontmatter.tipo).toBe('nota')
  })
})
