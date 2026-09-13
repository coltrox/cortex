import { describe, it, expect } from 'vitest'
import { porDiaDoCalendario } from './Calendario'
import type { NoteComCampos } from '../tipos'

const nota = (n: Partial<NoteComCampos> & { path: string; tipo: string }): NoteComCampos =>
  ({ title: n.path, date: null, campos: {}, ...n }) as unknown as NoteComCampos

describe('o que o calendario mostra', () => {
  it('so compromisso, prova, simulado e tarefa -- nenhuma outra nota com data', () => {
    const m = porDiaDoCalendario([
      nota({ path: 'Agenda/Dentista.md', tipo: 'evento', date: '2026-09-15' }),
      nota({ path: 'Estudos/Provas/P1.md', tipo: 'prova', date: '2026-09-15' }),
      nota({ path: 'Estudos/Simulado.md', tipo: 'simulado', date: '2026-09-16' }),
      nota({ path: 'Estudos/Lista.md', tipo: 'tarefa', date: '2026-09-17' }),
      nota({ path: 'Vida/Anotacao.md', tipo: 'anotacao', date: '2026-09-15' }),
      nota({ path: 'Saude/medida.md', tipo: 'medida', date: '2026-09-15' }),
      nota({ path: 'Grana/Guardei.md', tipo: 'porquinho', date: '2026-09-15' }),
      nota({ path: 'Diario/2026-09-15.md', tipo: 'diario', date: '2026-09-15' })
    ], 2026)
    expect(m.get('2026-09-15')?.map(n => n.tipo)).toEqual(['evento', 'prova'])
    expect(m.get('2026-09-16')?.map(n => n.tipo)).toEqual(['simulado'])
    expect(m.get('2026-09-17')?.map(n => n.tipo)).toEqual(['tarefa'])
  })

  it('a data comemorativa cai no dia dela, no ano que a grade mostra', () => {
    const niver = nota({ path: 'Agenda/Mae.md', tipo: 'data-comemorativa', campos: { dia: 3, mes: 10, ano: 1970 } })
    expect(porDiaDoCalendario([niver], 2026).get('2026-10-03')).toHaveLength(1)
    expect(porDiaDoCalendario([niver], 2027).get('2027-10-03')).toHaveLength(1)
  })

  it('29/02 cai em 28/02 em ano comum, e dia que nao existe nao aparece', () => {
    const bissexto = nota({ path: 'a.md', tipo: 'data-comemorativa', campos: { dia: 29, mes: 2 } })
    const torta = nota({ path: 'b.md', tipo: 'data-comemorativa', campos: { dia: 31, mes: 4 } })
    expect(porDiaDoCalendario([bissexto], 2027).get('2027-02-28')).toHaveLength(1)
    expect(porDiaDoCalendario([bissexto], 2028).get('2028-02-29')).toHaveLength(1)
    expect([...porDiaDoCalendario([torta], 2026).keys()]).toEqual([])
  })
})
