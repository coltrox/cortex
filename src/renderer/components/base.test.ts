import { describe, it, expect } from 'vitest'
import { dataCurta } from './base'

describe('dataCurta', () => {
  const HOJE = '2026-09-01'

  it('vira uma data que se le', () => {
    expect(dataCurta('2026-11-08', HOJE)).toBe('8 nov')
  })

  it('mostra o ano quando nao e o corrente', () => {
    // Sem o ano, uma prova de 2027 pareceria estar a duas semanas.
    expect(dataCurta('2027-11-08', HOJE)).toBe('8 nov 2027')
  })

  it('nao anda um dia para tras', () => {
    // `new Date('2026-01-01')` interpreta a string como UTC e volta 31/12 em
    // fuso negativo. Por isso a data e montada com os campos separados.
    expect(dataCurta('2026-01-01', HOJE)).toBe('1 jan')
    expect(dataCurta('2026-12-31', HOJE)).toBe('31 dez')
  })

  it('ausencia vira travessao, nao "Invalid Date"', () => {
    expect(dataCurta(null, HOJE)).toBe('—')
    expect(dataCurta(undefined, HOJE)).toBe('—')
    expect(dataCurta('', HOJE)).toBe('—')
  })

  it('texto que nao e data volta como veio', () => {
    // Melhor mostrar o que esta no frontmatter do que inventar uma data.
    expect(dataCurta('amanha', HOJE)).toBe('amanha')
    expect(dataCurta('2026-13', HOJE)).toBe('2026-13')
  })
})
