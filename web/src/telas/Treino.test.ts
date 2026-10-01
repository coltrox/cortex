import { describe, it, expect } from 'vitest'
import { tecladoNaFrente, resumoDoExercicio, repsAlvo } from './Treino'

describe('tecladoNaFrente', () => {
  it('teclado aberto come um terco da tela', () => {
    // iPhone: a janela continua com 812, mas so 480 ficam a vista.
    expect(tecladoNaFrente(812, 480)).toBe(true)
  })

  it('a barra de endereco indo e vindo nao conta como teclado', () => {
    expect(tecladoNaFrente(812, 760)).toBe(false)
    expect(tecladoNaFrente(812, 812)).toBe(false)
  })
})

describe('resumoDoExercicio', () => {
  it('concluido diz feito, com quantas series e o peso', () => {
    expect(resumoDoExercicio({ feito: true, feitas: [{ carga: 60, reps: 10 }, { carga: 60, reps: 8 }] }))
      .toBe('feito · 2× · 60 kg')
  })

  it('cargas diferentes mostram a maior', () => {
    expect(resumoDoExercicio({ feitas: [{ carga: 60, reps: 10 }, { carga: 70, reps: 8 }] }))
      .toBe('2 de 2 · até 70 kg')
  })

  it('sem nada anotado, diz que nao foi feito', () => {
    expect(resumoDoExercicio({ feitas: [{}, {}] })).toBe('não feito')
  })

  it('anotado pela metade mostra o quanto ja foi', () => {
    expect(resumoDoExercicio({ feitas: [{ carga: 40, reps: 12 }, {}, {}] })).toBe('1 de 3 · 40 kg')
  })
})

describe('repsAlvo', () => {
  it('a faixa do plano vira o alvo de cada serie', () => {
    // "8-10" e uma faixa: a primeira serie mira 8, a segunda 10, e da
    // terceira em diante fica no ultimo numero.
    expect(repsAlvo('4 × 8-10', 0)).toBe('8')
    expect(repsAlvo('4 × 8-10', 1)).toBe('10')
    expect(repsAlvo('4 × 8-10', 3)).toBe('10')
  })

  it('sem prescricao nao sugere nada', () => {
    expect(repsAlvo('', 0)).toBe('')
    expect(repsAlvo('ate a falha', 0)).toBe('')
  })
})
