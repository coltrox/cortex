import { describe, it, expect } from 'vitest'
import { dobra, pontuar } from '@compartilhado/busca'
import { formasDaData } from './Agenda'

/**
 * Procurar pela data na aba Chegando.
 *
 * A busca comparava so a forma ISO, que e como a data viaja e nao como
 * alguem a escreve. Quem procura a prova de outubro digita "18/10" -- e nao
 * achava nada, o que fazia a busca parecer quebrada quando ela so estava
 * surda para o vocabulario certo.
 */
const HOJE = '2026-09-11'

/** O mesmo caminho da tela: as formas viram campos, e o termo pontua. */
const acha = (iso: string, digitado: string): boolean =>
  pontuar(formasDaData(iso, HOJE), dobra(digitado)) !== null

describe('formasDaData', () => {
  it('acha por dia/mes, com zero e sem zero', () => {
    expect(acha('2026-10-18', '18/10')).toBe(true)
    expect(acha('2026-10-05', '5/10')).toBe(true)
    expect(acha('2026-10-05', '05/10')).toBe(true)
  })

  it('acha por dia/mes/ano', () => {
    expect(acha('2026-10-18', '18/10/2026')).toBe(true)
  })

  it('acha pelo nome do mes, inteiro ou abreviado', () => {
    expect(acha('2026-10-18', 'outubro')).toBe(true)
    expect(acha('2026-10-18', 'out')).toBe(true)
    // Sem acento tambem: e como se digita com pressa no celular.
    expect(acha('2026-03-02', 'marco')).toBe(true)
  })

  it('acha pela forma ISO, que continua valendo', () => {
    expect(acha('2026-10-18', '2026-10-18')).toBe(true)
  })

  it('acha por "hoje" e "amanha"', () => {
    expect(acha(HOJE, 'hoje')).toBe(true)
    expect(acha('2026-09-12', 'amanha')).toBe(true)
  })

  it('nao acha o que nao e daquele dia', () => {
    expect(acha('2026-10-18', '19/10')).toBe(false)
    expect(acha('2026-10-18', 'janeiro')).toBe(false)
  })

  it('data torta nao vira forma nenhuma, e nao quebra a busca', () => {
    // O item pode chegar sem data, ou com uma data escrita a mao no vault.
    expect(formasDaData('', HOJE)).toEqual([])
    expect(formasDaData('amanha', HOJE)).toEqual([])
    expect(formasDaData('18/10/2026', HOJE)).toEqual([])
  })
})
