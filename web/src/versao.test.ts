import { describe, it, expect } from 'vitest'
import { versaoPublicada, temVersaoNova } from './versao'

const resposta = (corpo: unknown, ok = true): typeof fetch =>
  (async () => ({ ok, json: async () => corpo })) as unknown as typeof fetch

/*
 * O app instalado no celular fica aberto por dias e nunca recarrega sozinho.
 * Uma versao nova so aparecia fechando o app de verdade -- e ninguem sabe que
 * precisa. Estes testes guardam a parte que decide "saiu versao nova".
 */
describe('versao nova do app web', () => {
  it('le o numero publicado em /versao.json', async () => {
    expect(await versaoPublicada(resposta({ versao: 'abc123' }))).toBe('abc123')
  })

  it('sem rede, sem arquivo ou com arquivo torto, nao ha numero', async () => {
    const semRede = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await versaoPublicada(semRede)).toBeNull()
    expect(await versaoPublicada(resposta({ versao: 'x' }, false))).toBeNull()
    expect(await versaoPublicada(resposta({ outra: 'coisa' }))).toBeNull()
    expect(await versaoPublicada(resposta('texto'))).toBeNull()
    expect(await versaoPublicada(resposta({ versao: '' }))).toBeNull()
  })

  it('pede sem cache, para um arquivo guardado nao dizer "nada mudou" para sempre', async () => {
    const pedidos: { url: string; init?: RequestInit }[] = []
    const espiao = (async (url: string, init?: RequestInit) => {
      pedidos.push({ url, init })
      return { ok: true, json: async () => ({ versao: 'v2' }) }
    }) as unknown as typeof fetch
    await versaoPublicada(espiao)
    expect(pedidos[0].url).toMatch(/^\/versao\.json\?t=\d+$/)
    expect(pedidos[0].init?.cache).toBe('no-store')
  })

  it('so e versao nova quando o publicado e outro', () => {
    expect(temVersaoNova('v1', 'v2')).toBe(true)
    expect(temVersaoNova('v1', 'v1')).toBe(false)
    // Sem resposta nao se oferece atualizar: seria um botao que recarrega a
    // mesma coisa.
    expect(temVersaoNova('v1', null)).toBe(false)
  })
})
