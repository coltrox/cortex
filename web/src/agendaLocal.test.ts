import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  lerPendentesAgenda, guardarPendenteAgenda, conciliarAgenda, pendenteComemorativo,
  type PendenteAgenda
} from './agendaLocal'

/**
 * O item marcado no celular precisa aparecer NO MESMO TOQUE.
 *
 * Antes ele so nascia depois da volta inteira pelo computador -- fila,
 * Supabase, campainha, o Cortex escrevendo a nota, republicando o cardapio, e
 * o celular buscando de novo. Com o computador desligado, isso e o dia
 * seguinte: quem marcava voltava para uma lista identica a de antes, concluia
 * que nao tinha ido, e marcava de novo.
 */
const HOJE = '2026-09-12'
const ONTEM = '2026-09-11'

const dentista: PendenteAgenda = {
  tipo: 'compromisso', titulo: 'Dentista', data: '2026-09-15', hora: '14:30'
}

describe('o que foi marcado e ainda nao voltou', () => {
  it('comeca vazio', () => {
    expect(lerPendentesAgenda(guardadoDeMemoria(), HOJE)).toEqual([])
  })

  it('guarda o que acabou de ser marcado', () => {
    const g = guardadoDeMemoria()
    expect(guardarPendenteAgenda(g, HOJE, dentista)).toEqual([dentista])
    expect(lerPendentesAgenda(g, HOJE)).toEqual([dentista])
  })

  it('dois compromissos diferentes convivem', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    const prova: PendenteAgenda = { tipo: 'prova', titulo: 'P1', data: '2026-10-01' }
    expect(guardarPendenteAgenda(g, HOJE, prova)).toHaveLength(2)
  })

  it('guarda a data DO COMPROMISSO, nao a do dia em que foi marcado', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    expect(lerPendentesAgenda(g, HOJE)[0].data).toBe('2026-09-15')
  })

  it('o pendente de ontem nao aparece hoje', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, ONTEM, dentista)
    expect(lerPendentesAgenda(g, HOJE)).toEqual([])
  })

  it('so o dia informado sobrevive a gravacao -- e a poda dos dias antigos', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, ONTEM, dentista)
    guardarPendenteAgenda(g, HOJE, { tipo: 'prova', titulo: 'P1', data: '2026-10-01' })
    expect(lerPendentesAgenda(g, ONTEM)).toEqual([])
  })
})

describe('conciliar com o que o Cortex devolveu', () => {
  it('o que voltou publicado sai da copia local', () => {
    // Sem isto o item apareceria DUAS vezes: uma do cardapio e outra daqui.
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    const restam = conciliarAgenda(g, HOJE, [
      { tipo: 'compromisso', titulo: 'Dentista', data: '2026-09-15' }
    ])
    expect(restam).toEqual([])
  })

  it('o que ainda nao voltou CONTINUA na tela', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    guardarPendenteAgenda(g, HOJE, { tipo: 'prova', titulo: 'P1', data: '2026-10-01' })
    const restam = conciliarAgenda(g, HOJE, [
      { tipo: 'compromisso', titulo: 'Dentista', data: '2026-09-15' }
    ])
    expect(restam.map(r => r.titulo)).toEqual(['P1'])
  })

  it('mesmo nome em data diferente nao conta como o mesmo', () => {
    // Dois "Dentista" em semanas diferentes sao dois compromissos.
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    const restam = conciliarAgenda(g, HOJE, [
      { tipo: 'compromisso', titulo: 'Dentista', data: '2026-11-20' }
    ])
    expect(restam).toHaveLength(1)
  })

  it('mesmo nome e data em TIPO diferente tambem nao conta', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    const restam = conciliarAgenda(g, HOJE, [
      { tipo: 'prova', titulo: 'Dentista', data: '2026-09-15' }
    ])
    expect(restam).toHaveLength(1)
  })

  it('espaco em volta do titulo nao atrapalha o encontro', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, dentista)
    expect(conciliarAgenda(g, HOJE, [
      { tipo: 'compromisso', titulo: '  Dentista  ', data: '2026-09-15' }
    ])).toEqual([])
  })
})

describe('data comemorativa marcada no celular', () => {
  /*
   * O defeito: o campo traz a data de quando comecou (1990-03-05), o pendente
   * guardava isso cru, e a aba Chegando esconde o que ja passou. O evento
   * subia, e o item sumia da tela no mesmo toque.
   */
  it('entra na lista na PROXIMA vez que cai, nao no ano digitado', () => {
    expect(pendenteComemorativo('Niver da tia', { dia: 11, mes: 9, ano: 1983 }, HOJE)).toEqual({
      tipo: 'compromisso', titulo: 'Niver da tia', data: '2027-09-11',
      comemorativa: true, anos: 44
    })
  })

  it('ainda este ano, se a data nao passou', () => {
    expect(pendenteComemorativo('Meu niver', { dia: 9, mes: 12, ano: 2008 }, HOJE)?.data).toBe('2026-12-09')
    expect(pendenteComemorativo('Meu niver', { dia: 9, mes: 12, ano: 2008 }, HOJE)?.anos).toBe(18)
  })

  it('hoje conta como a proxima', () => {
    expect(pendenteComemorativo('Hoje', { dia: 12, mes: 9, ano: 2000 }, HOJE)?.data).toBe(HOJE)
  })

  it('o namoro que comecou este ano vai fazer 1 ano', () => {
    // Antes o ano corrente era descartado, e o namoro de 12/01/2026 ficava
    // sem idade.
    const r = pendenteComemorativo('Namoro', { dia: 12, mes: 1, ano: 2026 }, HOJE)
    expect(r?.data).toBe('2027-01-12')
    expect(r?.anos).toBe(1)
  })

  it('sem ano, sem idade', () => {
    expect(pendenteComemorativo('Namoro', { dia: 12, mes: 1 }, HOJE)?.anos).toBeUndefined()
  })

  it('leva o que a data e, e a copia guardada devolve', () => {
    // E o que faz o cartao dizer "aniversario" no mesmo toque, antes de o
    // Cortex devolver a nota.
    const g = guardadoDeMemoria()
    const p = pendenteComemorativo('Clara', { dia: 27, mes: 3, ano: 2009, oque: 'aniversário' }, HOJE)!
    expect(p.oque).toBe('aniversário')
    guardarPendenteAgenda(g, HOJE, p)
    expect(lerPendentesAgenda(g, HOJE)[0].oque).toBe('aniversário')
  })

  it('casa com o que o Cortex devolve, e sai da copia local', () => {
    // O Cortex publica a proxima ocorrencia; com a data crua isto nunca casava
    // e o pendente ficava para sempre.
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, pendenteComemorativo('Niver da tia', { dia: 11, mes: 9, ano: 1983 }, HOJE)!)
    expect(conciliarAgenda(g, HOJE, [
      { tipo: 'compromisso', titulo: 'Niver da tia', data: '2027-09-11' }
    ])).toEqual([])
  })

  it('a idade sobrevive a releitura do armazenamento', () => {
    const g = guardadoDeMemoria()
    guardarPendenteAgenda(g, HOJE, pendenteComemorativo('Niver da tia', { dia: 11, mes: 9, ano: 1983 }, HOJE)!)
    expect(lerPendentesAgenda(g, HOJE)[0].anos).toBe(44)
  })

  it('data que nao existe nao vira pendente', () => {
    expect(pendenteComemorativo('X', { dia: 31, mes: 2, ano: 1990 }, HOJE)).toBeNull()
  })
})

describe('o que veio torto do armazenamento', () => {
  it('texto que nao e json nao derruba a leitura', () => {
    const g = guardadoDeMemoria()
    g.gravar('cortex.agenda-pendente', 'isto nao e json')
    expect(lerPendentesAgenda(g, HOJE)).toEqual([])
  })

  it('item sem titulo, sem data ou de tipo inventado e descartado', () => {
    const g = guardadoDeMemoria()
    g.gravar('cortex.agenda-pendente', JSON.stringify({
      [HOJE]: [
        { tipo: 'compromisso', titulo: '', data: '2026-09-15' },
        { tipo: 'compromisso', titulo: 'Sem data' },
        { tipo: 'foguete', titulo: 'X', data: '2026-09-15' },
        { tipo: 'compromisso', titulo: 'Data torta', data: '15/09/2026' },
        dentista
      ]
    }))
    expect(lerPendentesAgenda(g, HOJE)).toEqual([dentista])
  })
})
