import { describe, it, expect } from 'vitest'
import { lerTreino, lerCardio, duracao, comMilhar } from './treinoNota'

describe('lerTreino — a nota de sessao virando tela', () => {
  const legs = {
    modelo: 'Legs',
    exercicios: [
      {
        nome: 'Extensora', reps: '15', carga: 75, series: 4,
        feitas: [
          { reps: 15, carga: 54 }, { reps: 15, carga: 61 },
          { reps: 15, carga: 68 }, { reps: 15, carga: 75 }
        ]
      },
      {
        nome: 'Leg press', reps: '12-15', carga: 80, series: 3,
        feitas: [{ reps: 15, carga: 60 }, { reps: 13, carga: 70 }, { reps: 12, carga: 80 }]
      }
    ]
  }

  it('devolve serie a serie, a maior carga, a faixa de reps e o volume', () => {
    const t = lerTreino(legs)
    expect(t.modelo).toBe('Legs')
    expect(t.exercicios[0]).toMatchObject({ nome: 'Extensora', quantas: 4, carga: 75, reps: '15' })
    expect(t.exercicios[0].series).toHaveLength(4)
    // (54+61+68+75) × 15
    expect(t.exercicios[0].volume).toBe(3870)
    expect(t.exercicios[1].reps).toBe('12-15')
    expect(t.totalSeries).toBe(7)
    expect(t.volume).toBe(3870 + 60 * 15 + 70 * 13 + 80 * 12)
  })

  it('nota antiga, so com o resumo, ainda conta as series', () => {
    const t = lerTreino({ exercicios: [{ nome: 'Remada', series: 3, reps: '10', carga: 40 }] })
    expect(t.exercicios[0]).toMatchObject({ quantas: 3, carga: 40, reps: '10', volume: null })
    expect(t.totalSeries).toBe(3)
    expect(t.volume).toBeNull()
  })

  it('exercicio sem nome e serie em branco ficam de fora', () => {
    const t = lerTreino({
      exercicios: [
        { nome: '', feitas: [{ reps: 10, carga: 20 }] },
        { nome: 'Abdominal', feitas: [{ reps: 20 }, {}] }
      ]
    })
    expect(t.exercicios.map(e => e.nome)).toEqual(['Abdominal'])
    // Série só com repetição conta como série, mas não entra no volume.
    expect(t.exercicios[0]).toMatchObject({ quantas: 1, carga: null, reps: '20', volume: null })
  })

  it('campos estranhos nao quebram', () => {
    expect(lerTreino({}).exercicios).toEqual([])
    expect(lerTreino({ exercicios: 'nada' }).totalSeries).toBe(0)
  })
})

describe('lerCardio e formatos', () => {
  it('le o cardio da nota', () => {
    expect(lerCardio({ aparelho: 'escada', minutos: 20 }))
      .toEqual({ aparelho: 'escada', minutos: 20, distancia: null, pace: '', nivel: null })
  })

  it('sem aparelho vale "cardio"', () => {
    expect(lerCardio({ minutos: 30 }).aparelho).toBe('cardio')
  })

  it('duracao e milhar', () => {
    expect(duracao(20)).toBe('20 min')
    expect(duracao(60)).toBe('1 h')
    expect(duracao(90)).toBe('1 h 30 min')
    expect(comMilhar(8850)).toBe('8.850')
  })
})
