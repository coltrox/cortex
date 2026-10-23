import { describe, it, expect } from 'vitest'
import { semear, avancar, ligacoes, quantosNos, ALCANCE, type No } from './redeNeural'

/** Sorteio previsível: devolve a sequência dada, em roda. */
function fila(valores: number[]): () => number {
  let i = 0
  return () => valores[i++ % valores.length] ?? 0
}

const no = (x: number, y: number, vx = 0, vy = 0): No => ({ x, y, vx, vy, tamanho: 1 })

describe('semear', () => {
  it('cria a quantidade pedida, toda dentro da tela', () => {
    const nos = semear(30)
    expect(nos).toHaveLength(30)
    for (const n of nos) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(1)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(1)
      expect(n.tamanho).toBeGreaterThanOrEqual(0.4)
      expect(n.tamanho).toBeLessThanOrEqual(1)
    }
  })

  it('e deterministico quando o sorteio e', () => {
    const a = semear(5, fila([0.1, 0.2, 0.3, 0.4, 0.5]))
    const b = semear(5, fila([0.1, 0.2, 0.3, 0.4, 0.5]))
    expect(a).toEqual(b)
  })

  it('quantidade zero ou negativa nao quebra', () => {
    expect(semear(0)).toEqual([])
    expect(semear(-5)).toEqual([])
  })

  it('a velocidade e lenta: isto e pano de fundo, nao fogos de artificio', () => {
    for (const n of semear(40)) {
      expect(Math.abs(n.vx)).toBeLessThanOrEqual(0.015)
      expect(Math.abs(n.vy)).toBeLessThanOrEqual(0.015)
    }
  })
})

describe('avancar', () => {
  it('move na direcao da velocidade', () => {
    const r = avancar([no(0.5, 0.5, 1, 2)], 0.01)
    expect(r[0]?.x).toBeCloseTo(0.51, 5)
    expect(r[0]?.y).toBeCloseTo(0.52, 5)
  })

  it('quem sai por um lado volta pelo outro', () => {
    /* Enrolar, e nao quicar: nos que refletem se acumulam nos cantos, e em
       poucos segundos a nuvem vira duas manchas nas bordas. */
    expect(avancar([no(0.999, 0.5, 1, 0)], 0.01)[0]?.x).toBeCloseTo(0.009, 3)
    expect(avancar([no(0.001, 0.5, -1, 0)], 0.01)[0]?.x).toBeCloseTo(0.991, 3)
  })

  it('salto de tempo nao teleporta os nos', () => {
    /* A janela pode ficar escondida e voltar com varios segundos de dt. Sem
       o teto, a primeira pintura mostraria tudo fora do lugar. */
    const comSalto = avancar([no(0.5, 0.5, 1, 0)], 10)
    const comTeto = avancar([no(0.5, 0.5, 1, 0)], 0.05)
    expect(comSalto).toEqual(comTeto)
  })

  it('dt invalido ou negativo deixa tudo parado', () => {
    const parado = [no(0.5, 0.5, 1, 1)]
    expect(avancar(parado, NaN)[0]?.x).toBe(0.5)
    expect(avancar(parado, -3)[0]?.x).toBe(0.5)
  })

  it('nao modifica a lista recebida', () => {
    const antes = [no(0.5, 0.5, 1, 1)]
    avancar(antes, 0.05)
    expect(antes[0]?.x).toBe(0.5)
  })
})

describe('ligacoes', () => {
  it('liga quem esta perto e ignora quem esta longe', () => {
    const nos = [no(0.5, 0.5), no(0.52, 0.5), no(0.95, 0.95)]
    const l = ligacoes(nos)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ a: 0, b: 1 })
  })

  it('conta cada par UMA vez', () => {
    // Desenhar os dois sentidos dobraria o traco de cada linha.
    const todos = [no(0.5, 0.5), no(0.51, 0.5), no(0.52, 0.5)]
    expect(ligacoes(todos)).toHaveLength(3)
  })

  it('a forca cresce conforme se aproximam', () => {
    const perto = ligacoes([no(0.5, 0.5), no(0.505, 0.5)])[0]
    const longe = ligacoes([no(0.5, 0.5), no(0.5 + ALCANCE * 0.9, 0.5)])[0]
    expect(perto?.forca).toBeGreaterThan(longe?.forca ?? 1)
    expect(longe?.forca).toBeGreaterThan(0)
    expect(perto?.forca).toBeLessThanOrEqual(1)
  })

  it('rente ao limite ainda liga, com forca quase zero', () => {
    /* A linha nasce apagada e firma conforme se aproximam — e e isso que
       evita o piscar de quem cruza a fronteira do alcance.
       (No limite EXATO a conta depende de arredondamento binario, e esse
       caso nao muda nada na tela.) */
    const l = ligacoes([no(0.5, 0.5), no(0.5 + ALCANCE * 0.999, 0.5)])
    expect(l).toHaveLength(1)
    expect(l[0]?.forca).toBeCloseTo(0, 2)
  })

  it('rede vazia ou de um no so nao tem ligacao', () => {
    expect(ligacoes([])).toEqual([])
    expect(ligacoes([no(0.5, 0.5)])).toEqual([])
  })
})

describe('quantosNos', () => {
  it('cresce com a tela', () => {
    expect(quantosNos(1920, 1080)).toBeGreaterThan(quantosNos(375, 600))
  })

  it('tem teto: ligacao cresce ao QUADRADO dos nos', () => {
    /* "Uma gigantesca", ele pediu — mas passar de uma centena transforma a
       abertura num travamento, bem na hora em que o app deveria parecer
       rapido. */
    expect(quantosNos(5000, 4000)).toBeLessThanOrEqual(110)
  })

  it('tem piso: tela pequena ainda parece uma rede', () => {
    expect(quantosNos(320, 400)).toBeGreaterThanOrEqual(24)
  })

  it('tela de tamanho zero nao gera nada', () => {
    expect(quantosNos(0, 0)).toBe(0)
    expect(quantosNos(-10, 500)).toBe(0)
  })
})
