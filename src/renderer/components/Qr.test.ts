import { describe, it, expect } from 'vitest'
import { conteudoDoQr } from './Qr'

describe('conteudoDoQr', () => {
  const ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'

  it('vira um link quando ha endereco', () => {
    expect(conteudoDoQr(ID, 'https://cortex.vercel.app'))
      .toBe(`https://cortex.vercel.app/#id=${ID}`)
  })

  it('o id viaja no fragmento, nao na query', () => {
    // Fragmento nao e enviado ao servidor: o id nao aparece em log de acesso
    // nenhum, nem da hospedagem nem de proxy no meio do caminho.
    const c = conteudoDoQr(ID, 'https://cortex.vercel.app')
    expect(c).toContain('#id=')
    expect(c).not.toContain('?id=')
  })

  it('sem endereco, carrega o id cru para a pessoa colar a mao', () => {
    expect(conteudoDoQr(ID, '')).toBe(ID)
  })
})
