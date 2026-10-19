import { describe, it, expect } from 'vitest'
import { estatisticas } from './ProvaSimulado'

/*
 * A estatística é a parte do simulado que não pode errar: ela é o que diz a
 * ele o que estudar no dia seguinte. Uma conta errada aqui manda revisar a
 * matéria errada a três semanas da prova.
 */

const questoes = [
  { n: 1, materia: 'matemática', gabarito: 'b' },
  { n: 2, materia: 'matemática', gabarito: 'c' },
  { n: 3, materia: 'física', gabarito: 'a' },
  { n: 4, materia: 'física', gabarito: 'd' },
  { n: 5, materia: 'química', gabarito: 'e' }
]

describe('estatisticas', () => {
  it('conta certas e erradas', () => {
    const e = estatisticas(questoes, { 0: 'b', 1: 'a', 2: 'a', 3: 'd', 4: 'e' })
    expect(e.certas).toBe(4)
    expect(e.total).toBe(5)
  })

  it('questao em branco conta como erro -- na prova tambem conta', () => {
    const e = estatisticas(questoes, { 0: 'b' })
    expect(e.certas).toBe(1)
    expect(e.emBranco).toBe(4)
  })

  it('agrupa por materia', () => {
    const e = estatisticas(questoes, { 0: 'b', 1: 'c', 2: 'x', 3: 'x', 4: 'e' })
    expect(e.porMateria.find(m => m.materia === 'matemática'))
      .toEqual({ materia: 'matemática', certas: 2, total: 2, pct: 100 })
    expect(e.porMateria.find(m => m.materia === 'física'))
      .toEqual({ materia: 'física', certas: 0, total: 2, pct: 0 })
  })

  it('ordena da PIOR materia para a melhor -- e a ordem de estudar', () => {
    const e = estatisticas(questoes, { 0: 'b', 1: 'c', 2: 'x', 3: 'x', 4: 'e' })
    // Empate em 100% desempata por nome: matemática antes de química.
    expect(e.porMateria.map(m => m.materia)).toEqual(['física', 'matemática', 'química'])
  })

  it('questao sem materia cai em geral, e nao some da conta', () => {
    const e = estatisticas([{ gabarito: 'a' }, { gabarito: 'b' }], { 0: 'a' })
    expect(e.total).toBe(2)
    expect(e.porMateria).toEqual([{ materia: 'geral', certas: 1, total: 2, pct: 50 }])
  })

  it('simulado sem resposta nenhuma nao quebra', () => {
    const e = estatisticas(questoes, {})
    expect(e.certas).toBe(0)
    expect(e.emBranco).toBe(5)
  })
})
