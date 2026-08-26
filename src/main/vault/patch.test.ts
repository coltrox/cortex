import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import { parseFrontmatter } from '../parser/frontmatter'
import { patchFrontmatter } from './patch'

// Corpo real: acentos, "---" no meio de uma frase, bloco de código com
// crases, e uma seção no formato do Protocolo de Densidade Neural. Este é o
// corpo mais hostil que conseguimos montar para expor qualquer reformatação
// silenciosa que `matter.stringify` possa fazer.
const CORPO_HOSTIL = `
Acentuação: café, ação, extração de não-conformidade.

Uma frase qualquer com --- no meio do texto, não um delimitador.

Um bloco de código:
\`\`\`ts
const x = { a: 1, b: [1, 2, 3] }
\`\`\`

### 🕸️ Dependências da Rede

- [[Nota A]]
- [[Nota B]]
`

function rawCom(frontmatter: Record<string, unknown>): string {
  return matter.stringify(CORPO_HOSTIL, frontmatter)
}

describe('patchFrontmatter', () => {
  it('preserva o corpo byte a byte (acentos, --- no meio, crases, seção de densidade neural)', () => {
    const raw = rawCom({ tipo: 'nota', tags: ['a', 'b'] })
    const antes = parseFrontmatter(raw)
    expect(antes.parseError).toBeNull()

    const patched = patchFrontmatter(raw, { novoCampo: 'x' })
    const depois = parseFrontmatter(patched)

    expect(depois.parseError).toBeNull()
    expect(depois.body).toBe(antes.body)
  })

  it('acrescenta chave nova', () => {
    const raw = rawCom({ tipo: 'nota' })
    const patched = patchFrontmatter(raw, { prioridade: 'alta' })
    const r = parseFrontmatter(patched)
    expect(r.frontmatter.tipo).toBe('nota')
    expect(r.frontmatter.prioridade).toBe('alta')
  })

  it('substitui chave existente', () => {
    const raw = rawCom({ tipo: 'nota', status: 'aberto' })
    const patched = patchFrontmatter(raw, { status: 'fechado' })
    const r = parseFrontmatter(patched)
    expect(r.frontmatter.status).toBe('fechado')
  })

  it('null remove a chave', () => {
    const raw = rawCom({ tipo: 'nota', status: 'aberto' })
    const patched = patchFrontmatter(raw, { status: null })
    const r = parseFrontmatter(patched)
    expect(r.frontmatter.status).toBeUndefined()
    expect('status' in r.frontmatter).toBe(false)
  })

  it('patch em array substitui o array inteiro, não mescla item a item', () => {
    const raw = rawCom({ tipo: 'nota', tags: ['a', 'b', 'c'] })
    const patched = patchFrontmatter(raw, { tags: ['z'] })
    const r = parseFrontmatter(patched)
    expect(r.frontmatter.tags).toEqual(['z'])
  })

  it('lança em YAML inválido e não reescreve o que estava lá', () => {
    const raw = '---\ntipo: [nao, fechado\n---\ncorpo original'
    expect(() => patchFrontmatter(raw, { tipo: 'nota' })).toThrow()
  })

  it('mescla é rasa: chave irmã não enviada permanece intocada', () => {
    const raw = rawCom({ tipo: 'nota', autor: 'pedro' })
    const patched = patchFrontmatter(raw, { status: 'novo' })
    const r = parseFrontmatter(patched)
    expect(r.frontmatter.tipo).toBe('nota')
    expect(r.frontmatter.autor).toBe('pedro')
    expect(r.frontmatter.status).toBe('novo')
  })
})
