import { describe, it, expect } from 'vitest'
import { validarEvento, TIPOS_EVENTO } from './eventos'

describe('validarEvento', () => {
  it('aceita um evento bem formado', () => {
    const e = validarEvento({
      tipo: 'suplemento', dia: '2026-08-27', dados: { nome: 'Whey' }
    })
    expect(e.tipo).toBe('suplemento')
    expect(e.dia).toBe('2026-08-27')
  })

  it('recusa tipo que nao esta na lista', () => {
    expect(() => validarEvento({ tipo: 'inventado', dia: '2026-08-27', dados: {} }))
      .toThrow(/inválido/)
  })

  it('recusa data fora do formato ISO', () => {
    expect(() => validarEvento({ tipo: 'peso', dia: '27/08/2026', dados: { peso: 78 } }))
      .toThrow(/inválido/)
  })

  it('recusa dados acima de 8 KB — o limite que o banco tambem aplica', () => {
    const gigante = { texto: 'x'.repeat(9000) }
    expect(() => validarEvento({ tipo: 'anotacao', dia: '2026-08-27', dados: gigante }))
      .toThrow(/grande/)
  })

  it('cobre todos os tipos que a spec define', () => {
    expect([...TIPOS_EVENTO].sort()).toEqual([
      'anotacao', 'cardio', 'gasto', 'medida', 'peso',
      'refeicao_extra', 'refeicao_plano', 'sessao', 'suplemento'
    ])
  })
})
