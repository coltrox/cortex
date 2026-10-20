import { describe, it, expect } from 'vitest'
import {
  espessura, acaoDoPonteiro, tamanhoDoBitmap, TRACO_BORRACHA, comZoom, nomeDoPng,
  limitarEscala, paraFolha, comArrasto, comPinca, VISTA_INICIAL,
  ESCALA_MIN, ESCALA_MAX
} from './rascunho'

describe('acaoDoPonteiro', () => {
  it('caneta desenha, sempre', () => {
    expect(acaoDoPonteiro('pen', false, false)).toBe('desenhar')
    expect(acaoDoPonteiro('pen', true, true)).toBe('desenhar')
  })

  it('no celular, sem caneta nenhuma, o dedo desenha', () => {
    expect(acaoDoPonteiro('touch', false, false)).toBe('desenhar')
  })

  it('depois da caneta aparecer, o dedo move a folha', () => {
    expect(acaoDoPonteiro('touch', true, false)).toBe('mover')
  })

  it('com a caneta encostada, a mao apoiada nao faz NADA', () => {
    /* O bug que o dono sentiu: "eu to escrevendo, nao ta escrevendo
       exatamente onde eu to escrevendo". A palma nao riscava, mas arrastava
       a folha por baixo da ponta da caneta. */
    expect(acaoDoPonteiro('touch', true, true)).toBe('ignorar')
  })

  it('mouse desenha: no computador nao ha pinca', () => {
    expect(acaoDoPonteiro('mouse', true, false)).toBe('desenhar')
  })
})

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

  it('folha grande em tela densa nao estoura a memoria', () => {
    /* Bitmap cresce ao quadrado. A folha grande que ele pediu ("escrever
       bastante") num tablet de densidade 3 daria 25 milhoes de pixels, e o
       navegador do celular mata a aba. */
    const r = tamanhoDoBitmap(2000, 1400, 3)
    expect(r.largura * r.altura).toBeLessThanOrEqual(16_000_000)
    expect(r.escala).toBeLessThan(3)
  })

  it('mesmo numa folha enorme, o bitmap nunca fica menor que ela', () => {
    // Encolher abaixo de 1 deixaria o traco borrado, que e o oposto do que
    // esta funcao existe para fazer.
    expect(tamanhoDoBitmap(8000, 6000, 3).escala).toBe(1)
  })
})

describe('comZoom', () => {
  const centro = { x: 100, y: 100 }

  it('amplia mantendo parado o ponto do centro', () => {
    /* Sem a ancora, ampliar jogaria a folha para um canto e ele perderia de
       vista a conta que estava fazendo. */
    const v = comZoom(VISTA_INICIAL, 2, centro)
    expect(v.escala).toBe(2)
    /* Antes do zoom, o ponto da folha sob o centro era (100,100), porque a
       vista inicial nao tem deslocamento nem escala. Depois do zoom tem de
       ser o MESMO ponto — e e isso que faz a folha nao escapar. */
    expect(paraFolha(centro.x, centro.y, { left: v.x, top: v.y }, v.escala))
      .toEqual({ x: 100, y: 100 })
  })

  it('reduz do mesmo jeito', () => {
    expect(comZoom({ x: 0, y: 0, escala: 2 }, 0.5, centro).escala).toBe(1)
  })

  it('respeita o teto e o piso de escala', () => {
    expect(comZoom(VISTA_INICIAL, 100, centro).escala).toBe(ESCALA_MAX)
    expect(comZoom(VISTA_INICIAL, 0.001, centro).escala).toBe(ESCALA_MIN)
  })

  it('fator invalido nao mexe na vista', () => {
    expect(comZoom({ x: 5, y: 5, escala: 2 }, NaN, centro))
      .toEqual({ x: 5, y: 5, escala: 2 })
  })
})

describe('nomeDoPng', () => {
  it('leva data e hora locais, para um nao sobrescrever o outro', () => {
    expect(nomeDoPng(new Date(2026, 9, 20, 14, 30))).toBe('rascunho 2026-10-20 14h30.png')
  })

  it('completa com zero a esquerda', () => {
    expect(nomeDoPng(new Date(2026, 0, 5, 9, 7))).toBe('rascunho 2026-01-05 09h07.png')
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
  /* O retangulo vem do PROPRIO canvas, ja com a transformacao aplicada pelo
     navegador. Por isso a conta e so "quanto andei da borda, em pixels de
     folha" — e nao precisa saber onde a folha esta nem de que canto ela
     cresce ao ampliar. */

  it('sem mover nem ampliar, so desconta a borda da folha', () => {
    expect(paraFolha(120, 110, { left: 20, top: 10 }, 1)).toEqual({ x: 100, y: 100 })
  })

  it('com a folha movida, o traco sai onde a caneta encostou', () => {
    // Folha arrastada 50 para a direita: a borda dela andou junto.
    expect(paraFolha(120, 110, { left: 70, top: 40 }, 1)).toEqual({ x: 50, y: 70 })
  })

  it('com zoom, desfaz a escala', () => {
    // Sem desfazer, o traco apareceria longe da ponta — e quanto maior o
    // zoom, mais longe.
    expect(paraFolha(120, 110, { left: 20, top: 10 }, 2)).toEqual({ x: 50, y: 50 })
  })

  it('a borda ja transformada e o unico dado necessario', () => {
    /* Este e o bug que o dono sentiu: "nao ta escrevendo exatamente onde eu
       to escrevendo". O CSS ampliava a folha a partir do CENTRO, e a conta
       antiga supunha o canto — entao a cada zoom o traco se afastava da
       ponta da caneta. Com a borda medida depois da transformacao, o ponto
       so depende de onde a folha esta DE FATO na tela. */
    expect(paraFolha(300, 200, { left: -100, top: -50 }, 2)).toEqual({ x: 200, y: 125 })
  })

  it('escala invalida nao manda o traco para o infinito', () => {
    // Um `scale(0)` dividiria por zero e o traco viraria Infinity.
    expect(paraFolha(120, 110, { left: 20, top: 10 }, 0)).toEqual({ x: 100, y: 100 })
    expect(paraFolha(120, 110, { left: 20, top: 10 }, NaN)).toEqual({ x: 100, y: 100 })
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
