import { describe, it, expect } from 'vitest'
import { linhaDaTentativa, registrarTentativa } from './tentativas'

/*
 * O defeito que originou isto: a nota de conteúdo guardava só `acertos` e
 * `total`, então refazer os exercícios APAGAVA o resultado anterior. O pedido
 * dele foi "a quantidade que eu acertei sem sumir, e se eu errei também as
 * observações" — daí o histórico acumulado e a lista de questões erradas.
 */

describe('linhaDaTentativa', () => {
  it('mostra data, acerto, tempo e quais questoes erraram', () => {
    expect(linhaDaTentativa({
      data: '2026-10-27', acertos: 17, total: 20, minutos: 12, erradas: [3, 7, 9]
    })).toBe('2026-10-27 · 17/20 · 12 min · errou 3, 7, 9')
  })

  it('sem erro nenhum, diz que foi tudo certo', () => {
    expect(linhaDaTentativa({ data: '2026-10-27', acertos: 20, total: 20, minutos: 9 }))
      .toBe('2026-10-27 · 20/20 · 9 min · tudo certo')
  })

  it('sem cronometro, a linha nao inventa tempo', () => {
    expect(linhaDaTentativa({ data: '2026-10-27', acertos: 5, total: 20, erradas: [1, 2] }))
      .toBe('2026-10-27 · 5/20 · errou 1, 2')
  })
})

describe('registrarTentativa', () => {
  const nova = { data: '2026-10-27', acertos: 15, total: 20, minutos: 10, erradas: [4] }

  it('a mais recente fica em primeiro', () => {
    const fora = registrarTentativa(['2026-10-20 · 10/20 · errou 1'], nova)
    expect(fora[0]).toContain('2026-10-27')
    expect(fora[1]).toContain('2026-10-20')
  })

  it('nota sem historico comeca a lista', () => {
    expect(registrarTentativa(undefined, nova)).toHaveLength(1)
  })

  it('campo com uma string so (editado a mao) nao e perdido', () => {
    expect(registrarTentativa('2026-10-01 · 8/20', nova)).toHaveLength(2)
  })

  it('campo de tipo inesperado nao derruba o registro', () => {
    expect(registrarTentativa({ coisa: 1 }, nova)).toEqual([
      '2026-10-27 · 15/20 · 10 min · errou 4'
    ])
  })

  it('o historico tem teto, para o frontmatter nao crescer para sempre', () => {
    const antigas = Array.from({ length: 30 }, (_, i) => `2026-09-${i + 1} · 1/20`)
    expect(registrarTentativa(antigas, nova)).toHaveLength(20)
  })
})
