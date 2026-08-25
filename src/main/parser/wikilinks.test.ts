import { describe, it, expect } from 'vitest'
import { extractWikiLinks } from './wikilinks'

describe('extractWikiLinks', () => {
  it('extrai link simples com número da linha', () => {
    const links = extractWikiLinks('primeira\nver [[MOC - Segurança]]')
    expect(links).toEqual([{ target: 'MOC - Segurança', line: 2 }])
  })

  it('extrai alias e âncora', () => {
    const links = extractWikiLinks('[[Nima|o projeto]] e [[REQ - Validação#XSS]]')
    expect(links[0]).toEqual({ target: 'Nima', alias: 'o projeto', line: 1 })
    expect(links[1]).toEqual({ target: 'REQ - Validação', anchor: 'XSS', line: 1 })
  })

  it('ignora links dentro de bloco de código cercado', () => {
    const body = 'antes\n```js\nconst x = "[[nao-e-link]]"\n```\ndepois [[real]]'
    const links = extractWikiLinks(body)
    expect(links.map(l => l.target)).toEqual(['real'])
  })

  it('ignora links dentro de código inline', () => {
    expect(extractWikiLinks('use `[[assim]]` no texto')).toEqual([])
  })

  it('devolve lista vazia quando não há links', () => {
    expect(extractWikiLinks('texto puro')).toEqual([])
  })

  it('extrai links com terminação CRLF', () => {
    const links = extractWikiLinks('linha 1\r\n[[Link1]] aqui\r\ne [[Link2#anchor|alias]] ali')
    expect(links).toHaveLength(2)
    expect(links[0]).toEqual({ target: 'Link1', line: 2 })
    expect(links[1]).toEqual({ target: 'Link2', anchor: 'anchor', alias: 'alias', line: 3 })
  })
})
