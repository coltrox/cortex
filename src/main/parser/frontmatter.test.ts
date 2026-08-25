import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from './frontmatter'

describe('parseFrontmatter', () => {
  it('extrai frontmatter válido e devolve o corpo', () => {
    const raw = `---
tipo: projeto
tags: [tech, seguranca]
created: 2026-08-02
---

# Nima

Conteúdo.`
    const r = parseFrontmatter(raw)
    expect(r.parseError).toBeNull()
    expect(r.frontmatter.tipo).toBe('projeto')
    expect(r.frontmatter.tags).toEqual(['tech', 'seguranca'])
    expect(r.body.trim().startsWith('# Nima')).toBe(true)
  })

  it('trata nota sem frontmatter', () => {
    const r = parseFrontmatter('só texto')
    expect(r.parseError).toBeNull()
    expect(r.frontmatter).toEqual({})
    expect(r.body).toBe('só texto')
  })

  it('não quebra com YAML inválido: devolve parseError e corpo cru', () => {
    const raw = `---
tipo: [nao, fechado
---
corpo`
    const r = parseFrontmatter(raw)
    expect(r.parseError).not.toBeNull()
    expect(r.frontmatter).toEqual({})
    expect(r.body).toContain('corpo')
  })

  it('normaliza datas para string ISO, não Date', () => {
    const raw = `---
created: 2026-08-02
---
x`
    const r = parseFrontmatter(raw)
    expect(r.frontmatter.created).toBe('2026-08-02')
  })

  it('não quebra com YAML inválido em CRLF: devolve parseError e corpo cru', () => {
    const raw = '---\r\ntipo: [nao, fechado\r\n---\r\ncorpo com texto'
    const r = parseFrontmatter(raw)
    expect(r.parseError).not.toBeNull()
    expect(r.frontmatter).toEqual({})
    expect(r.body).toContain('corpo com texto')
  })

  it('extrai frontmatter válido com CRLF', () => {
    const raw = '---\r\ntipo: projeto\r\ntags: [tech, seguranca]\r\n---\r\n\r\n# Nima\r\n\r\nConteúdo.'
    const r = parseFrontmatter(raw)
    expect(r.parseError).toBeNull()
    expect(r.frontmatter.tipo).toBe('projeto')
    expect(r.frontmatter.tags).toEqual(['tech', 'seguranca'])
    expect(r.body.trim().startsWith('# Nima')).toBe(true)
  })
})
