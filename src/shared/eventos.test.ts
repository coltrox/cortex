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

  it('aceita dados com emoji que passam de 8192 unidades UTF-16 mas ficam sob 8192 code points — é isso que o banco conta', () => {
    // Cada emoji ocupa 2 unidades UTF-16 mas é 1 code point só. Com N = 4500,
    // o JSON passa de 8192 em .length (UTF-16) mas fica bem abaixo em code
    // points — o mesmo critério que o Postgres usa em length(p_dados::text).
    const dados = { texto: '😀'.repeat(4500) }
    expect(JSON.stringify(dados).length).toBeGreaterThan(8192)
    const e = validarEvento({ tipo: 'anotacao', dia: '2026-08-27', dados })
    expect(e.dados).toEqual(dados)
  })

  it('cobre todos os tipos que a spec define', () => {
    expect([...TIPOS_EVENTO].sort()).toEqual([
      'anotacao', 'cardio', 'compromisso', 'compromisso_cancelado', 'gasto',
      'medida', 'peso', 'prova_estudada', 'refeicao_extra', 'refeicao_plano',
      'sessao', 'suplemento'
    ])
  })
})
