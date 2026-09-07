import { describe, it, expect } from 'vitest'
import { ehLinkSeguro } from './marcacao'

/*
 * O corpo da nota agora vem do banco, e vira tela no celular.
 *
 * Isto é a única decisão do renderizador que, errada, vira problema de
 * segurança: o que é link clicável e o que é só texto. Todo o resto do
 * arquivo produz elementos React, nunca HTML — um `<script>` escrito no meio
 * da anotação chega na tela como os caracteres que ele é.
 */
describe('o que pode virar link clicável', () => {
  it('http e https, sim', () => {
    expect(ehLinkSeguro('https://unicamp.br/inscricao')).toBe(true)
    expect(ehLinkSeguro('http://exemplo.com')).toBe(true)
  })

  it('maiúsculas não escapam', () => {
    // `JavaScript:` passaria por uma comparação sensível a caixa.
    expect(ehLinkSeguro('HTTPS://exemplo.com')).toBe(true)
    expect(ehLinkSeguro('JavaScript:alert(1)')).toBe(false)
  })

  it('espaço na frente não escapa', () => {
    // Markdown deixa espaço sobrar, e ` javascript:` driblaria um `startsWith`.
    expect(ehLinkSeguro('  https://exemplo.com')).toBe(true)
    expect(ehLinkSeguro('  javascript:alert(1)')).toBe(false)
  })

  it('esquemas perigosos viram texto', () => {
    expect(ehLinkSeguro('javascript:alert(1)')).toBe(false)
    expect(ehLinkSeguro('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(ehLinkSeguro('vbscript:msgbox(1)')).toBe(false)
    expect(ehLinkSeguro('file:///C:/Users')).toBe(false)
  })

  it('caminho do vault não vira link no celular', () => {
    // No Cortex do computador um `Anexos/x.mp4` abre o arquivo; aqui não há
    // arquivo nenhum para abrir, então tem que ficar texto.
    expect(ehLinkSeguro('Anexos/oracao.mp4')).toBe(false)
    expect(ehLinkSeguro('../Anexos/audio.mp4')).toBe(false)
  })

  it('nem tudo que contém http é http', () => {
    // O teste é do começo da string, não de conter em qualquer lugar.
    expect(ehLinkSeguro('javascript:void("https://ok.com")')).toBe(false)
  })
})
