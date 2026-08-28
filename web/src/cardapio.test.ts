import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  lerCardapio, gravarCardapio, diaDaSemana,
  suplementosDoDia, refeicoesDoPlano, treinos, exerciciosDoTreino
} from './cardapio'
import { jaFeitos, marcarFeito } from './feitos'
import type { ItemCardapio } from '@compartilhado/eventos'

const ITENS: ItemCardapio[] = [
  { especie: 'suplemento', nome: 'Creatina', detalhe: { dose: '5 g', dias: ['seg', 'qua', 'sex'] } },
  { especie: 'suplemento', nome: 'Vitamina D', detalhe: { dose: '2000 UI' } },
  { especie: 'refeicao', nome: 'Café da manhã', detalhe: { hora: '07:00', kcal: 500 } },
  {
    especie: 'treino', nome: 'Peito e tríceps',
    detalhe: { grupo: 'peito', exercicios: [{ nome: 'Supino reto', series: 4, reps: '8-10' }] }
  }
]

describe('cardápio guardado', () => {
  it('vem vazio quando nunca foi buscado', () => {
    expect(lerCardapio(guardadoDeMemoria())).toEqual({ itens: [], atualizadoEm: null })
  })

  it('grava e lê', () => {
    const g = guardadoDeMemoria()
    gravarCardapio(g, ITENS, '2026-08-28T10:00:00.000Z')
    const c = lerCardapio(g)
    expect(c.itens).toHaveLength(4)
    expect(c.atualizadoEm).toBe('2026-08-28T10:00:00.000Z')
  })

  it('volta vazio se o armazenamento estiver corrompido', () => {
    expect(lerCardapio(guardadoDeMemoria({ 'cortex.cardapio': '{{{' })).itens).toEqual([])
  })

  it('descarta item guardado fora de forma', () => {
    const cru = JSON.stringify({
      atualizadoEm: null,
      itens: [{ especie: 'treino', nome: 'Peito', detalhe: {} }, { especie: 'foguete' }]
    })
    expect(lerCardapio(guardadoDeMemoria({ 'cortex.cardapio': cru })).itens).toHaveLength(1)
  })
})

describe('diaDaSemana', () => {
  it('usa o vocabulário do Cortex', () => {
    // 2026-08-28 é uma sexta-feira.
    expect(diaDaSemana('2026-08-28')).toBe('sex')
    expect(diaDaSemana('2026-08-29')).toBe('sab')
    expect(diaDaSemana('2026-08-30')).toBe('dom')
  })
})

describe('consultas do cardápio', () => {
  const c = { itens: ITENS, atualizadoEm: null }

  it('suplemento com dias só aparece no dia certo', () => {
    expect(suplementosDoDia(c, '2026-08-26').map(s => s.nome)).toEqual(['Creatina', 'Vitamina D'])
    expect(suplementosDoDia(c, '2026-08-25').map(s => s.nome)).toEqual(['Vitamina D'])
  })

  it('suplemento sem dias aparece todo dia', () => {
    // Ausência de `dias` é "sempre", não "nunca": é o padrão de quem cadastrou
    // o suplemento sem pensar em dia da semana.
    expect(suplementosDoDia(c, '2026-08-25').map(s => s.nome)).toContain('Vitamina D')
  })

  it('lista refeições e treinos', () => {
    expect(refeicoesDoPlano(c).map(r => r.nome)).toEqual(['Café da manhã'])
    expect(treinos(c).map(t => t.nome)).toEqual(['Peito e tríceps'])
  })

  it('lê os exercícios de um treino', () => {
    expect(exerciciosDoTreino(ITENS[3])).toEqual([{ nome: 'Supino reto', series: 4, reps: '8-10' }])
  })

  it('treino sem exercícios devolve lista vazia em vez de quebrar', () => {
    expect(exerciciosDoTreino({ especie: 'treino', nome: 'X', detalhe: {} })).toEqual([])
  })

  it('descarta exercício sem nome vindo do cardápio', () => {
    const t: ItemCardapio = {
      especie: 'treino', nome: 'X', detalhe: { exercicios: [{ series: 3 }, { nome: 'Rosca' }] }
    }
    expect(exerciciosDoTreino(t)).toEqual([{ nome: 'Rosca' }])
  })
})

describe('o que já foi marcado hoje', () => {
  it('começa vazio e lembra o que foi marcado', () => {
    const g = guardadoDeMemoria()
    expect(jaFeitos(g, '2026-08-28')).toEqual([])
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    expect(jaFeitos(g, '2026-08-28')).toEqual(['suplemento:Creatina'])
  })

  it('não repete a mesma marca', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    expect(jaFeitos(g, '2026-08-28')).toEqual(['suplemento:Creatina'])
  })

  it('separa os dias — o check volta desmarcado amanhã', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    expect(jaFeitos(g, '2026-08-29')).toEqual([])
  })

  it('esquece dias antigos ao gravar', () => {
    // Um mapa que cresce para sempre estoura o localStorage sem ninguém ver.
    const g = guardadoDeMemoria()
    marcarFeito(g, '2026-01-01', 'suplemento:Creatina')
    marcarFeito(g, '2026-08-28', 'suplemento:Whey')
    expect(jaFeitos(g, '2026-01-01')).toEqual([])
  })

  it('sobrevive a armazenamento corrompido', () => {
    expect(jaFeitos(guardadoDeMemoria({ 'cortex.feitos': 'nada disso' }), '2026-08-28')).toEqual([])
  })
})
