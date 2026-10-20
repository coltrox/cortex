import { describe, it, expect } from 'vitest'
import { figuraSegura } from './figura'

const triangulo =
  '<svg viewBox="0 0 200 150">' +
  '<polygon points="20,130 180,130 60,20" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<text x="95" y="145" font-size="12" text-anchor="middle">8 cm</text>' +
  '</svg>'

describe('figuraSegura', () => {
  it('aceita o desenho de geometria', () => {
    expect(figuraSegura(triangulo)).toBe(triangulo)
  })

  it('aceita um grafico com eixos, curva e rotulos', () => {
    const grafico =
      '<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg">' +
      '<g stroke="currentColor"><line x1="20" y1="160" x2="220" y2="160"/>' +
      '<line x1="20" y1="160" x2="20" y2="20"/></g>' +
      '<path d="M30 150 Q120 10 210 150" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="120" cy="80" r="3" fill="currentColor"/>' +
      '</svg>'
    expect(figuraSegura(grafico)).toBe(grafico)
  })

  /* O que segue e o motivo de este modulo existir: o SVG entra no DOM como
     markup, e o campo vem do vault pela nuvem. */

  it('recusa script embutido', () => {
    expect(figuraSegura('<svg><script>alert(1)</script></svg>')).toBeNull()
  })

  it('recusa manipulador de evento', () => {
    expect(figuraSegura('<svg onload="alert(1)"><circle r="2"/></svg>')).toBeNull()
    expect(figuraSegura('<svg><circle r="2" onclick="roubar()"/></svg>')).toBeNull()
  })

  it('recusa link e conteudo de fora', () => {
    expect(figuraSegura('<svg><a href="http://x"><circle r="2"/></a></svg>')).toBeNull()
    expect(figuraSegura('<svg><image href="http://x/y.png"/></svg>')).toBeNull()
    expect(figuraSegura('<svg><use xlink:href="#x"/></svg>')).toBeNull()
    expect(figuraSegura('<svg><foreignObject><b>oi</b></foreignObject></svg>')).toBeNull()
  })

  it('recusa style, que aceitaria url()', () => {
    expect(figuraSegura('<svg><style>@import url(x)</style></svg>')).toBeNull()
    expect(figuraSegura('<svg><circle r="2" style="fill:url(#x)"/></svg>')).toBeNull()
  })

  it('recusa javascript: e data: em qualquer lugar', () => {
    expect(figuraSegura('<svg><circle fill="javascript:alert(1)" r="2"/></svg>')).toBeNull()
    expect(figuraSegura('<svg><circle fill="data:text/html,x" r="2"/></svg>')).toBeNull()
  })

  it('recusa markup solto depois do fecha-svg', () => {
    expect(figuraSegura('<svg><circle r="2"/></svg><img src=x>')).toBeNull()
  })

  it('recusa dois svg no mesmo campo', () => {
    expect(figuraSegura('<svg><circle r="2"/></svg><svg><circle r="2"/></svg>')).toBeNull()
  })

  it('recusa o que nao comeca como svg', () => {
    expect(figuraSegura('<div><svg><circle r="2"/></svg></div>')).toBeNull()
    expect(figuraSegura('texto solto')).toBeNull()
  })

  it('recusa entidade numerica, que esconde caractere', () => {
    expect(figuraSegura('<svg><text>&#106;avascript</text></svg>')).toBeNull()
  })

  it('recusa comentario, que pode esconder markup', () => {
    expect(figuraSegura('<svg><!-- <script> --><circle r="2"/></svg>')).toBeNull()
  })

  it('recusa figura gigante', () => {
    const enorme = `<svg viewBox="0 0 10 10">${'<circle r="1"/>'.repeat(1000)}</svg>`
    expect(figuraSegura(enorme)).toBeNull()
  })

  it('campo ausente ou de outro tipo e so uma questao sem figura', () => {
    expect(figuraSegura(undefined)).toBeNull()
    expect(figuraSegura(null)).toBeNull()
    expect(figuraSegura(42)).toBeNull()
    expect(figuraSegura('   ')).toBeNull()
  })

  it('tag desconhecida derruba a figura inteira, em vez de ser removida', () => {
    /* Recusar e mais seguro do que limpar: limpar exige adivinhar a intencao
       de um markup que ninguem revisou. */
    expect(figuraSegura('<svg><circle r="2"/><blink>x</blink></svg>')).toBeNull()
  })
})
