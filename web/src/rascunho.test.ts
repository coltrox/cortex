import { describe, it, expect } from 'vitest'
import { espessura, deveDesenhar, tamanhoDoBitmap, TRACO_BORRACHA } from './rascunho'

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
