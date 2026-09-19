import { describe, it, expect } from 'vitest'
import { ocorrencias, linhaEColuna, MAX_OCORRENCIAS } from './buscaTexto'

describe('busca no editor (Ctrl+F)', () => {
  it('acha todas, sem diferenciar maiúscula', () => {
    expect(ocorrencias('App app APP', 'app')).toEqual([0, 4, 8])
  })

  it('não sobrepõe: "aa" em "aaaa" são duas', () => {
    expect(ocorrencias('aaaa', 'aa')).toEqual([0, 2])
  })

  it('termo vazio não acha nada', () => {
    expect(ocorrencias('qualquer coisa', '')).toEqual([])
  })

  it('para num limite, para arquivo enorme não travar', () => {
    expect(ocorrencias('x'.repeat(MAX_OCORRENCIAS + 50), 'x')).toHaveLength(MAX_OCORRENCIAS)
  })

  it('diz a linha e a coluna de uma posição, para rolar até ela', () => {
    const t = 'abc\ndef\nghi'
    expect(linhaEColuna(t, 0)).toEqual({ linha: 0, coluna: 0 })
    expect(linhaEColuna(t, 5)).toEqual({ linha: 1, coluna: 1 })
    expect(linhaEColuna(t, 10)).toEqual({ linha: 2, coluna: 2 })
  })
})
