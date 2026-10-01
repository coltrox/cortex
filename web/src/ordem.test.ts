import { describe, it, expect } from 'vitest'
import { mover, fendaDoArrasto, moverParaFenda, type Caixa } from './ordem'

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
  // Quatro cartoes de 100 px, colados: 0-100, 100-200, 200-300, 300-400.
  const caixas: Caixa[] = [0, 100, 200, 300].map(topo => ({ topo, altura: 100 }))

  it('a fenda abre quando o dedo passa do meio do cartao', () => {
    expect(fendaDoArrasto(49, caixas)).toBe(0)    // antes do primeiro
    expect(fendaDoArrasto(51, caixas)).toBe(1)    // entre o 1o e o 2o
    expect(fendaDoArrasto(149, caixas)).toBe(1)
    expect(fendaDoArrasto(151, caixas)).toBe(2)   // entre o 2o e o 3o
  })

  it('abaixo do ultimo e a fenda do fim, que nao existia antes', () => {
    // Era aqui que o exercicio caia "em cima" do ultimo em vez de depois dele.
    expect(fendaDoArrasto(9999, caixas)).toBe(4)
  })

  it('acima de tudo e a fenda zero; lista vazia tambem', () => {
    expect(fendaDoArrasto(-500, caixas)).toBe(0)
    expect(fendaDoArrasto(10, [])).toBe(0)
  })
})

describe('moverParaFenda', () => {
  it('soltar entre dois poe o exercicio entre eles', () => {
    // Fenda 2 = entre 'remada' e 'rosca'.
    expect(moverParaFenda(lista, 0, 2)).toEqual(['remada', 'supino', 'rosca', 'triceps'])
  })

  it('a fenda depois do item de origem desconta a saida dele', () => {
    // Quem saiu da posicao 1 e foi para a fenda 2 fica onde estava: tirar o
    // item desloca tudo que vem depois.
    expect(moverParaFenda(lista, 1, 2)).toEqual(lista)
    expect(moverParaFenda(lista, 1, 1)).toEqual(lista)
  })

  it('a fenda do fim leva para o ultimo lugar', () => {
    expect(moverParaFenda(lista, 0, 4)).toEqual(['remada', 'rosca', 'triceps', 'supino'])
  })

  it('a fenda zero leva para a frente de todos', () => {
    expect(moverParaFenda(lista, 3, 0)).toEqual(['triceps', 'supino', 'remada', 'rosca'])
  })
})
