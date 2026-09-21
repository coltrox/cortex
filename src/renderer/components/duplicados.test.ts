import { describe, it, expect } from 'vitest'
import { repetidos, tituloComparavel, copiasDoGoogle } from './duplicados'
import type { NoteComCampos } from '../tipos'

const nota = (n: Partial<NoteComCampos> & { path: string; tipo: string }): NoteComCampos =>
  ({ title: n.path, date: null, campos: {}, ...n }) as unknown as NoteComCampos

describe('compromissos repetidos no calendario', () => {
  it('compara sem acento, maiusculas, pontuacao, "Prova:" e "Aniversario de"', () => {
    expect(tituloComparavel('Prova: Unicamp — 1ª fase!')).toBe('unicamp 1ª fase')
    expect(tituloComparavel('Aniversário da Ana')).toBe('ana')
    expect(tituloComparavel('  REUNIÃO   na escola ')).toBe('reuniao na escola')
  })

  it('mesmo dia e mesmo titulo formam um grupo; dia diferente nao', () => {
    const g = repetidos([
      nota({ path: 'Agenda/Dentista.md', tipo: 'evento', title: 'Dentista', date: '2026-09-22' }),
      nota({ path: 'Agenda/Dentista (2).md', tipo: 'evento', title: 'dentista', date: '2026-09-22' }),
      nota({ path: 'Agenda/Dentista outro.md', tipo: 'evento', title: 'Dentista', date: '2026-09-29' })
    ])
    expect(g).toHaveLength(1)
    expect(g[0].quando).toBe('2026-09-22')
    expect(g[0].notas.map(n => n.path)).toEqual(['Agenda/Dentista.md', 'Agenda/Dentista (2).md'])
  })

  it('horas diferentes sao compromissos diferentes; sem hora casa com qualquer uma', () => {
    const base = { tipo: 'evento', title: 'Treino', date: '2026-09-22' }
    expect(repetidos([
      nota({ ...base, path: 'a.md', campos: { hora: '07:00' } }),
      nota({ ...base, path: 'b.md', campos: { hora: '18:00' } })
    ])).toEqual([])
    const g = repetidos([
      nota({ ...base, path: 'a.md', campos: { hora: '07:00' } }),
      nota({ ...base, path: 'b.md', campos: { hora: '18:00' } }),
      nota({ ...base, path: 'c.md' })
    ])
    expect(g.map(x => x.notas.map(n => n.path))).toEqual([['a.md', 'c.md'], ['b.md', 'c.md']])
  })

  it('cancelado nao conta, e o que nao vai para o calendario tambem nao', () => {
    expect(repetidos([
      nota({ path: 'a.md', tipo: 'evento', title: 'Aula', date: '2026-09-22' }),
      nota({ path: 'b.md', tipo: 'evento', title: 'Aula', date: '2026-09-22', campos: { cancelado: true } }),
      nota({ path: 'c.md', tipo: 'anotacao', title: 'Aula', date: '2026-09-22' })
    ])).toEqual([])
  })

  it('aniversario da pessoa e data comemorativa igual no mesmo dia sao repetidos', () => {
    const g = repetidos([
      nota({ path: 'Vida/Ana.md', tipo: 'pessoa', title: 'Ana', campos: { nascimento_dia: 3, nascimento_mes: 10 } }),
      nota({ path: 'Agenda/Niver.md', tipo: 'data-comemorativa', title: 'Aniversário da Ana', campos: { dia: 3, mes: 10 } })
    ])
    expect(g).toHaveLength(1)
    expect(g[0].quando).toBe('--10-03')
  })

  it('pessoa com a caixinha desmarcada nao esta no calendario', () => {
    expect(repetidos([
      nota({ path: 'Vida/Ana.md', tipo: 'pessoa', title: 'Ana',
        campos: { nascimento_dia: 3, nascimento_mes: 10, aniversario_no_calendario: false } }),
      nota({ path: 'Agenda/Niver.md', tipo: 'data-comemorativa', title: 'Aniversário da Ana', campos: { dia: 3, mes: 10 } })
    ])).toEqual([])
  })
})

describe('copias iguais vindas do Google', () => {
  const g = (path: string, extra: Record<string, unknown> = {}) => nota({
    path, tipo: 'evento', title: 'redação', date: '2026-09-23', campos: { hora: '20:00', origem: 'google', ...extra }
  })

  it('fica a de nome mais curto; as outras saem', () => {
    const grupos = repetidos([g('Agenda/redação (15).md'), g('Agenda/redação.md'), g('Agenda/redação (2).md')])
    expect(copiasDoGoogle(grupos).map(n => n.path)).toEqual(['Agenda/redação (2).md', 'Agenda/redação (15).md'])
  })

  it('grupo com nota feita no Cortex ou com diferenca fica para o dono decidir', () => {
    expect(copiasDoGoogle(repetidos([g('a.md'), g('b.md', { origem: undefined })]))).toEqual([])
    expect(copiasDoGoogle(repetidos([g('a.md'), g('b.md', { local: 'Escola' })]))).toEqual([])
  })
})
