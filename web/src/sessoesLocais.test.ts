import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  guardarSessaoLocal, sessoesLocais, sessoesComLocais, conciliarSessoes
} from './sessoesLocais'
import type { SessaoFeita } from './cardapio'

const sessao = (data: string, modelo: string, carga = 60): SessaoFeita => ({
  data,
  modelo,
  exercicios: [{ nome: 'Supino', series: null, reps: '', carga: null, feitas: [{ carga, reps: 10 }] }]
})

describe('sessoes registradas no aparelho', () => {
  it('a sessao registrada aparece no historico antes de o Cortex devolver', () => {
    const g = guardadoDeMemoria()
    guardarSessaoLocal(g, sessao('2026-09-30', 'Upper A'))
    expect(sessoesComLocais([], sessoesLocais(g)).map(s => s.modelo)).toEqual(['Upper A'])
  })

  it('registrar de novo o mesmo treino do mesmo dia substitui, e nao duplica', () => {
    const g = guardadoDeMemoria()
    guardarSessaoLocal(g, sessao('2026-09-30', 'Upper A', 60))
    guardarSessaoLocal(g, sessao('2026-09-30', 'Upper A', 65))
    const guardadas = sessoesLocais(g)
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0].exercicios[0].feitas[0].carga).toBe(65)
  })

  it('quando o Cortex traz a sessao, a do Cortex manda', () => {
    const doCortex = [sessao('2026-09-30', 'Upper A', 70)]
    const juntas = sessoesComLocais(doCortex, [sessao('2026-09-30', 'Upper A', 60)])
    expect(juntas).toHaveLength(1)
    expect(juntas[0].exercicios[0].feitas[0].carga).toBe(70)
  })

  it('as mais novas vem primeiro, misturando as duas origens', () => {
    const juntas = sessoesComLocais([sessao('2026-09-28', 'Lower')], [sessao('2026-09-30', 'Upper A')])
    expect(juntas.map(s => s.data)).toEqual(['2026-09-30', '2026-09-28'])
  })

  it('conciliar tira a local que o Cortex ja publicou', () => {
    const g = guardadoDeMemoria()
    guardarSessaoLocal(g, sessao('2026-09-30', 'Upper A'))
    expect(conciliarSessoes(g, [sessao('2026-09-30', 'Upper A')])).toBe(true)
    expect(sessoesLocais(g)).toEqual([])
  })

  it('cardapio ainda sem sessao nenhuma nao confirma nada', () => {
    // E o estado da tela antes de o cardapio carregar: limpar aqui apagaria
    // o treino que acabou de ser registrado.
    const g = guardadoDeMemoria()
    guardarSessaoLocal(g, sessao('2026-09-30', 'Upper A'))
    expect(conciliarSessoes(g, [])).toBe(false)
    expect(sessoesLocais(g)).toHaveLength(1)
  })
})
