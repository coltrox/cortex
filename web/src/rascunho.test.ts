import { describe, it, expect } from 'vitest'
import {
  espessura, deveDesenhar, tamanhoDoBitmap, TRACO_BORRACHA,
  limitarEscala, paraFolha, comArrasto, comPinca, VISTA_INICIAL,
  ESCALA_MIN, ESCALA_MAX
} from './rascunho'

describe('espessura', () => {
  it('cresce com a pressao da caneta', () => {
    expect(espessura(0.9, 'caneta')).toBeGreaterThan(espessura(0.2, 'caneta'))
  })

  it('pressao zero nao vira traco invisivel', () => {
    // Mouse e alguns navegadores reportam 0; sem o piso, o rascunho nao
    // desenharia nada e pareceria quebrado.
    expect(espessura(0, 'caneta')).toBeGreaterThan(0)
    expect(espessura(NaN, 'caneta')).toBeGreaterThan(0)
  })

  it('pressao acima de 1 nao explode o traco', () => {
    expect(espessura(5, 'caneta')).toBe(espessura(1, 'caneta'))
  })

  it('borracha tem espessura fixa', () => {
    expect(espessura(0.1, 'borracha')).toBe(TRACO_BORRACHA)
    expect(espessura(1, 'borracha')).toBe(TRACO_BORRACHA)
  })

  it('a borracha e bem mais larga que a caneta', () => {
    expect(espessura(1, 'borracha')).toBeGreaterThan(espessura(1, 'caneta') * 5)
  })
})

describe('deveDesenhar', () => {
  it('dedo desenha enquanto nenhuma caneta apareceu', () => {
    expect(deveDesenhar('touch', false)).toBe(true)
  })

  it('depois da caneta, o dedo para de desenhar', () => {
    // E a rejeicao de palma: a mao apoiada na tela nao pode riscar a folha.
    expect(deveDesenhar('touch', true)).toBe(false)
  })

  it('caneta e mouse desenham sempre', () => {
    expect(deveDesenhar('pen', true)).toBe(true)
    expect(deveDesenhar('pen', false)).toBe(true)
    expect(deveDesenhar('mouse', true)).toBe(true)
  })
})

describe('tamanhoDoBitmap', () => {
  it('multiplica pela densidade da tela', () => {
    expect(tamanhoDoBitmap(300, 200, 2)).toEqual({ largura: 600, altura: 400, escala: 2 })
  })

  it('nunca encolhe abaixo da medida em CSS', () => {
    expect(tamanhoDoBitmap(300, 200, 0.5).escala).toBe(1)
  })

  it('tem teto de 3 para nao estourar memoria', () => {
    expect(tamanhoDoBitmap(300, 200, 6).escala).toBe(3)
  })

  it('densidade invalida vira 1', () => {
    expect(tamanhoDoBitmap(300, 200, NaN).escala).toBe(1)
  })

  it('tamanho zero nao gera bitmap invalido', () => {
    const r = tamanhoDoBitmap(0, 0, 2)
    expect(r.largura).toBeGreaterThan(0)
    expect(r.altura).toBeGreaterThan(0)
  })
})

describe('limitarEscala', () => {
  it('mantem a escala dentro dos limites', () => {
    expect(limitarEscala(0.01)).toBe(ESCALA_MIN)
    expect(limitarEscala(99)).toBe(ESCALA_MAX)
    expect(limitarEscala(2)).toBe(2)
  })

  it('valor invalido volta para 1', () => {
    expect(limitarEscala(NaN)).toBe(1)
  })
})

describe('paraFolha', () => {
  const origem = { left: 20, top: 10 }

  it('sem mover nem ampliar, so desconta a origem', () => {
    expect(paraFolha(120, 110, origem, VISTA_INICIAL)).toEqual({ x: 100, y: 100 })
  })

  it('com a folha movida, o traco sai onde a caneta encostou', () => {
    const v = { x: 50, y: 30, escala: 1 }
    expect(paraFolha(120, 110, origem, v)).toEqual({ x: 50, y: 70 })
  })

  it('com zoom, desfaz a escala', () => {
    // Sem desfazer, o traco apareceria longe da ponta — e quanto maior o
    // zoom, mais longe.
    const v = { x: 0, y: 0, escala: 2 }
    expect(paraFolha(120, 110, origem, v)).toEqual({ x: 50, y: 50 })
  })
})

describe('comArrasto', () => {
  it('um dedo move a folha sem mudar o tamanho', () => {
    expect(comArrasto({ x: 10, y: 10, escala: 2 }, 15, -5))
      .toEqual({ x: 25, y: 5, escala: 2 })
  })
})

describe('comPinca', () => {
  const par = (ax: number, ay: number, bx: number, by: number) =>
    ({ a: { x: ax, y: ay }, b: { x: bx, y: by } })

  it('afastar os dedos amplia', () => {
    const r = comPinca(VISTA_INICIAL, par(100, 100, 200, 100), par(50, 100, 250, 100))
    expect(r.escala).toBeCloseTo(2, 5)
  })

  it('aproximar os dedos reduz', () => {
    const r = comPinca(VISTA_INICIAL, par(0, 0, 200, 0), par(50, 0, 150, 0))
    expect(r.escala).toBeCloseTo(0.5, 5)
  })

  it('o ponto sob o meio dos dedos continua sob o meio dos dedos', () => {
    // E o que faz a pinca parecer natural: sem a ancora, a folha escapa para
    // um canto enquanto se tenta ampliar um trecho.
    const v = { x: 0, y: 0, escala: 1 }
    const antes = par(100, 100, 200, 100)
    const agora = par(60, 100, 260, 100)
    const r = comPinca(v, antes, agora)
    const meioAntes = { x: 150, y: 100 }
    const meioAgora = { x: 160, y: 100 }
    const ancora = { x: (meioAntes.x - v.x) / v.escala, y: (meioAntes.y - v.y) / v.escala }
    expect(r.x + ancora.x * r.escala).toBeCloseTo(meioAgora.x, 5)
    expect(r.y + ancora.y * r.escala).toBeCloseTo(meioAgora.y, 5)
  })

  it('respeita o teto de zoom', () => {
    const r = comPinca({ x: 0, y: 0, escala: ESCALA_MAX }, par(0, 0, 10, 0), par(0, 0, 500, 0))
    expect(r.escala).toBe(ESCALA_MAX)
  })

  it('dedos no mesmo ponto nao viram divisao por zero', () => {
    const v = { x: 5, y: 5, escala: 1 }
    expect(comPinca(v, par(10, 10, 10, 10), par(20, 20, 40, 40))).toBe(v)
  })
})
