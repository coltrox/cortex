import { describe, it, expect } from 'vitest'
import { rotuloData, tituloCurto } from './rotulos'

describe('rotuloData', () => {
  it('monta dia da semana e data curta', () => {
    expect(rotuloData('2026-10-19')).toBe('SEG, 19/10')
    expect(rotuloData('2026-11-15')).toBe('DOM, 15/11')
  })

  it('o dia da semana vem da DATA, nao do titulo', () => {
    // 21/10/2026 e quarta. Se o cronograma for remarcado e o titulo continuar
    // dizendo "seg", o cartao ainda mostra o dia certo.
    expect(rotuloData('2026-10-21').startsWith('QUA')).toBe(true)
  })

  it('data vazia ou torta nao vira NaN na tela', () => {
    expect(rotuloData('')).toBe('')
    expect(rotuloData('amanha')).toBe('')
    expect(rotuloData('19/10/2026')).toBe('')
    expect(rotuloData(undefined as unknown as string)).toBe('')
  })
})

describe('tituloCurto', () => {
  it('tira o prefixo de data que a linha de cima ja mostra', () => {
    expect(tituloCurto('19/10 seg — Matemática: razão, proporção e %'))
      .toBe('Matemática: razão, proporção e %')
  })

  it('funciona com os tres tipos de traco', () => {
    expect(tituloCurto('20/10 ter – Linguagens')).toBe('Linguagens')
    expect(tituloCurto('20/10 ter - Linguagens')).toBe('Linguagens')
    expect(tituloCurto('20/10 ter — Linguagens')).toBe('Linguagens')
  })

  it('titulo sem o padrao fica intacto', () => {
    // Cortar por aproximacao comeria o comeco de uma nota qualquer.
    expect(tituloCurto('Trigonometria — círculo, seno e cosseno'))
      .toBe('Trigonometria — círculo, seno e cosseno')
    expect(tituloCurto('Flashcards - Matemática')).toBe('Flashcards - Matemática')
    expect(tituloCurto('Redação 19/10')).toBe('Redação 19/10')
  })

  it('titulo que e so o prefixo nao fica vazio', () => {
    expect(tituloCurto('08/11 dom — ')).toBe('08/11 dom —')
  })

  it('aguenta nome vazio', () => {
    expect(tituloCurto('')).toBe('')
    expect(tituloCurto(undefined as unknown as string)).toBe('')
  })
})
