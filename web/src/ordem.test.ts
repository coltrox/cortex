import { describe, it, expect } from 'vitest'
import { mover, alvoDoArrasto, type Caixa } from './ordem'

describe('mover', () => {
  const lista = ['supino', 'remada', 'rosca', 'triceps']

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

describe('alvoDoArrasto', () => {
  // Quatro cartoes de 100 px, colados: 0-100, 100-200, 200-300, 300-400.
  const caixas: Caixa[] = [0, 100, 200, 300].map(topo => ({ topo, altura: 100 }))

  it('o item so cede o lugar quando o dedo passa do meio dele', () => {
    expect(alvoDoArrasto(49, caixas)).toBe(0)
    expect(alvoDoArrasto(51, caixas)).toBe(1)
    expect(alvoDoArrasto(149, caixas)).toBe(1)
    expect(alvoDoArrasto(151, caixas)).toBe(2)
  })

  it('acima do primeiro e abaixo do ultimo encosta nas pontas', () => {
    expect(alvoDoArrasto(-500, caixas)).toBe(0)
    expect(alvoDoArrasto(9999, caixas)).toBe(3)
  })

  it('lista vazia nao quebra', () => {
    expect(alvoDoArrasto(10, [])).toBe(0)
  })
})
