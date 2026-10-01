import { describe, it, expect } from 'vitest'
import { mover, fendaDoArrasto, soltarEm, type Caixa } from './ordem'

const lista = ['supino', 'remada', 'rosca', 'triceps']

describe('mover', () => {
  it('leva o item para cima', () => {
    expect(mover(lista, 2, 0)).toEqual(['rosca', 'supino', 'remada', 'triceps'])
  })

  it('leva o item para baixo', () => {
    expect(mover(lista, 0, 3)).toEqual(['remada', 'rosca', 'triceps', 'supino'])
  })

  it('soltar no mesmo lugar devolve a MESMA lista, sem render a toa', () => {
    expect(mover(lista, 1, 1)).toBe(lista)
  })

  it('indice fora da lista nao mexe em nada', () => {
    expect(mover(lista, 9, 0)).toBe(lista)
    expect(mover(lista, 0, -1)).toBe(lista)
  })
})

describe('fendaDoArrasto', () => {
  /*
   * A lista durante o arraste: QUEM FICOU na tela, sem o cartao que esta na
   * mao. Aqui o 'supino' saiu para ser arrastado, entao sobraram tres
   * cartoes de 100 px, colados: 0-100, 100-200, 200-300.
   */
  const queFicaram: Caixa[] = [0, 100, 200].map(topo => ({ topo, altura: 100 }))

  it('a fenda abre quando o dedo passa do meio do cartao', () => {
    expect(fendaDoArrasto(49, queFicaram)).toBe(0)
    expect(fendaDoArrasto(51, queFicaram)).toBe(1)
    expect(fendaDoArrasto(149, queFicaram)).toBe(1)
    expect(fendaDoArrasto(151, queFicaram)).toBe(2)
  })

  it('abaixo de todos, a fenda e a do fim', () => {
    // Era o caso que nao funcionava: para baixo o dedo nunca chegava la,
    // porque o proprio cartao arrastado entrava na conta e descia junto.
    expect(fendaDoArrasto(9999, queFicaram)).toBe(3)
  })

  it('acima de tudo e a fenda zero; lista vazia tambem', () => {
    expect(fendaDoArrasto(-500, queFicaram)).toBe(0)
    expect(fendaDoArrasto(10, [])).toBe(0)
  })
})

describe('soltarEm', () => {
  it('solta entre dois, contando a posicao sem o proprio item', () => {
    // Tirou 'supino' (0); sobra [remada, rosca, triceps]; soltar na posicao 1
    // e entrar entre 'remada' e 'rosca'.
    expect(soltarEm(lista, 0, 1)).toEqual(['remada', 'supino', 'rosca', 'triceps'])
  })

  it('para BAIXO vai mesmo para baixo', () => {
    // O que ele viu quebrado: arrastar o primeiro ate o fim.
    expect(soltarEm(lista, 0, 3)).toEqual(['remada', 'rosca', 'triceps', 'supino'])
    expect(soltarEm(lista, 1, 2)).toEqual(['supino', 'rosca', 'remada', 'triceps'])
  })

  it('para cima continua indo para cima', () => {
    expect(soltarEm(lista, 3, 0)).toEqual(['triceps', 'supino', 'remada', 'rosca'])
    expect(soltarEm(lista, 2, 1)).toEqual(['supino', 'rosca', 'remada', 'triceps'])
  })

  it('soltar no proprio lugar devolve a MESMA lista', () => {
    expect(soltarEm(lista, 1, 1)).toBe(lista)
    expect(soltarEm(lista, 0, 0)).toBe(lista)
  })

  it('posicao fora da lista encosta na ponta, sem quebrar', () => {
    expect(soltarEm(lista, 0, 99)).toEqual(['remada', 'rosca', 'triceps', 'supino'])
    expect(soltarEm(lista, 3, -5)).toEqual(['triceps', 'supino', 'remada', 'rosca'])
    expect(soltarEm(lista, 9, 0)).toBe(lista)
  })
})
