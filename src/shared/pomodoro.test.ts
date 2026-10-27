import { describe, it, expect } from 'vitest'
import { duracoesValidas, DURACOES_PADRAO } from './pomodoro'

/*
 * As durações passaram a ser editáveis no celular ("o pomodoro coloca opção
 * de editar"), e o valor vem do armazenamento do navegador — isto é, de fora.
 * Estes testes fixam o que acontece com cada jeito de o valor chegar errado,
 * porque um número ruim ali vira um pomodoro que não acaba nunca.
 */

describe('duracoesValidas', () => {
  it('sem nada guardado, usa o 25/5/15', () => {
    expect(duracoesValidas(undefined)).toEqual(DURACOES_PADRAO)
    expect(duracoesValidas(null)).toEqual(DURACOES_PADRAO)
    expect(duracoesValidas('lixo')).toEqual(DURACOES_PADRAO)
  })

  it('aceita o que ele editou', () => {
    expect(duracoesValidas({ foco: 50, pausa: 10, 'pausa-longa': 30 }))
      .toEqual({ foco: 50, pausa: 10, 'pausa-longa': 30 })
  })

  it('campo ruim cai no padrao sozinho, sem derrubar os outros', () => {
    expect(duracoesValidas({ foco: 50, pausa: 'abc' }))
      .toEqual({ foco: 50, pausa: 5, 'pausa-longa': 15 })
  })

  it('zero e negativo viram um minuto: fase que acaba ao comecar nao serve', () => {
    expect(duracoesValidas({ foco: 0, pausa: -3, 'pausa-longa': 15 }))
      .toEqual({ foco: 1, pausa: 1, 'pausa-longa': 15 })
  })

  it('numero absurdo e cortado no teto', () => {
    expect(duracoesValidas({ foco: 99999, pausa: 5, 'pausa-longa': 15 }).foco).toBe(180)
  })

  it('minuto quebrado e arredondado', () => {
    expect(duracoesValidas({ foco: 24.6, pausa: 5, 'pausa-longa': 15 }).foco).toBe(25)
  })
})
