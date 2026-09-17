import { describe, it, expect } from 'vitest'
import {
  corpoDoCortex, hashDoCorpo, planejarSincronia, quandoDoGoogle, camposDoGoogle, itemDepoisDoGoogle,
  type ItemCortex, type EventoGoogle, type Mapa
} from './logica'

const ANO = 2026

const item = (p: Partial<ItemCortex> & { path: string }): ItemCortex => ({
  tipo: 'evento', titulo: 'Dentista', date: '2026-09-20', hora: null, local: null,
  dia: null, mes: null, ano: null, mtime: Date.parse('2026-09-10T12:00:00Z'), ...p
})

/** Ligação como a última rodada teria deixado para este item. */
const ligacao = (i: ItemCortex, id: string, atualizado = '2026-09-10T12:00:00.000Z') => ({
  id, hash: hashDoCorpo(corpoDoCortex(i, ANO)!), atualizado
})

const evento = (p: Partial<EventoGoogle> & { id: string }): EventoGoogle => ({
  status: 'confirmed', summary: 'Dentista', updated: '2026-09-10T12:00:00.000Z',
  start: { date: '2026-09-20' }, ...p
})

describe('corpoDoCortex', () => {
  it('compromisso com hora dura uma hora, no fuso de São Paulo, e vira o dia se precisar', () => {
    const c = corpoDoCortex(item({ path: 'Agenda/D.md', hora: '23:30', local: 'Centro' }), ANO)!
    expect(c.start).toEqual({ dateTime: '2026-09-20T23:30:00', timeZone: 'America/Sao_Paulo' })
    expect(c.end).toEqual({ dateTime: '2026-09-21T00:30:00', timeZone: 'America/Sao_Paulo' })
    expect(c.location).toBe('Centro')
    expect(c.extendedProperties.private).toEqual({ cortex: '1', cortexPath: 'Agenda/D.md', cortexTipo: 'evento' })
  })

  it('sem hora é dia inteiro; prova ganha o prefixo', () => {
    const c = corpoDoCortex(item({ path: 'Estudos/Provas/ENEM.md', tipo: 'prova', titulo: 'ENEM' }), ANO)!
    expect(c.summary).toBe('Prova: ENEM')
    expect(c.start).toEqual({ date: '2026-09-20' })
    expect(c.end).toEqual({ date: '2026-09-21' })
  })

  it('data comemorativa se repete todo ano, a partir do ano em que começou', () => {
    const c = corpoDoCortex(item({ path: 'Agenda/Mãe.md', tipo: 'data-comemorativa', date: null, dia: 12, mes: 5, ano: 1975 }), ANO)!
    expect(c.start).toEqual({ date: '1975-05-12' })
    expect(c.recurrence).toEqual(['RRULE:FREQ=YEARLY'])
  })

  it('sem data que caiba num calendário não vira evento', () => {
    expect(corpoDoCortex(item({ path: 'a.md', date: null }), ANO)).toBeNull()
    expect(corpoDoCortex(item({ path: 'a.md', date: 'amanhã' }), ANO)).toBeNull()
    expect(corpoDoCortex(item({ path: 'a.md', tipo: 'data-comemorativa', date: null, dia: 31, mes: 4 }), ANO)).toBeNull()
  })
})

describe('quandoDoGoogle e camposDoGoogle — entrada de fora', () => {
  it('converte o horário para São Paulo, venha no fuso que vier', () => {
    expect(quandoDoGoogle({ dateTime: '2026-09-20T17:00:00Z' })).toEqual({ date: '2026-09-20', hora: '14:00' })
    expect(quandoDoGoogle({ dateTime: '2026-09-21T01:30:00Z' })).toEqual({ date: '2026-09-20', hora: '22:30' })
    expect(quandoDoGoogle({ date: '2026-09-20' })).toEqual({ date: '2026-09-20', hora: null })
    expect(quandoDoGoogle({ date: 'hoje' })).toBeNull()
    expect(quandoDoGoogle({ dateTime: 42 })).toBeNull()
  })

  it('corta texto comprido, tira caractere de controle e não aceita título vazio', () => {
    const c = camposDoGoogle(evento({ id: 'x', summary: `a\nb${'c'.repeat(500)}`, location: ['não é texto'] }))!
    expect(c.titulo.length).toBe(200)
    expect(c.titulo).not.toContain('\n')
    expect(c.local).toBeNull()
    expect(camposDoGoogle(evento({ id: 'y', summary: '   ' }))!.titulo).toBe('(sem título)')
  })
})

describe('planejarSincronia', () => {
  it('nota nova sobe; nada mudou, nada acontece', () => {
    const a = item({ path: 'Agenda/A.md' })
    const b = item({ path: 'Agenda/B.md' })
    const mapa: Mapa = { 'Agenda/B.md': ligacao(b, 'gb') }
    const p = planejarSincronia({ itens: [a, b], eventos: [evento({ id: 'gb' })], mapa, anoAtual: ANO })
    expect(p.paraGoogle).toEqual([{ acao: 'inserir', path: 'Agenda/A.md', corpo: corpoDoCortex(a, ANO) }])
    expect(p.paraCortex).toEqual([])
    expect(p.desligar).toEqual([])
  })

  it('mudou só no Cortex: atualiza o Google', () => {
    const antes = item({ path: 'Agenda/A.md' })
    const depois = { ...antes, hora: '10:00' }
    const p = planejarSincronia({
      itens: [depois], eventos: [evento({ id: 'ga' })], mapa: { 'Agenda/A.md': ligacao(antes, 'ga') }, anoAtual: ANO
    })
    expect(p.paraGoogle).toEqual([{ acao: 'atualizar', path: 'Agenda/A.md', id: 'ga', corpo: corpoDoCortex(depois, ANO) }])
  })

  it('compromisso mudou só no Google: atualiza a nota', () => {
    const a = item({ path: 'Agenda/A.md' })
    const ev = evento({ id: 'ga', summary: 'Dentista (remarcado)', start: { dateTime: '2026-09-22T12:00:00-03:00' }, updated: '2026-09-11T09:00:00.000Z' })
    const p = planejarSincronia({ itens: [a], eventos: [ev], mapa: { 'Agenda/A.md': ligacao(a, 'ga') }, anoAtual: ANO })
    expect(p.paraGoogle).toEqual([])
    expect(p.paraCortex).toEqual([{
      acao: 'atualizar', path: 'Agenda/A.md', id: 'ga', atualizado: '2026-09-11T09:00:00.000Z',
      campos: { titulo: 'Dentista (remarcado)', date: '2026-09-22', hora: '12:00', local: null }
    }])
  })

  it('mudou dos dois lados: vence o mais recente', () => {
    const antes = item({ path: 'Agenda/A.md' })
    const ev = evento({ id: 'ga', summary: 'Pelo Google', updated: '2026-09-11T09:00:00.000Z' })
    const mapa = { 'Agenda/A.md': ligacao(antes, 'ga') }

    const cortexMaisNovo = { ...antes, titulo: 'Pelo Cortex', mtime: Date.parse('2026-09-12T00:00:00Z') }
    const p1 = planejarSincronia({ itens: [cortexMaisNovo], eventos: [ev], mapa, anoAtual: ANO })
    expect(p1.paraGoogle.map(o => o.acao)).toEqual(['atualizar'])
    expect(p1.paraCortex).toEqual([])

    const cortexMaisVelho = { ...antes, titulo: 'Pelo Cortex', mtime: Date.parse('2026-09-11T00:00:00Z') }
    const p2 = planejarSincronia({ itens: [cortexMaisVelho], eventos: [ev], mapa, anoAtual: ANO })
    expect(p2.paraCortex.map(o => o.acao)).toEqual(['atualizar'])
    expect(p2.paraGoogle).toEqual([])
  })

  it('prova e data comemorativa mandam do Cortex: edição no Google é desfeita', () => {
    const prova = item({ path: 'Estudos/Provas/ENEM.md', tipo: 'prova', titulo: 'ENEM' })
    const ev = evento({ id: 'gp', summary: 'Outra coisa', updated: '2026-09-11T09:00:00.000Z' })
    const p = planejarSincronia({ itens: [prova], eventos: [ev], mapa: { [prova.path]: ligacao(prova, 'gp') }, anoAtual: ANO })
    expect(p.paraCortex).toEqual([])
    expect(p.paraGoogle).toEqual([{ acao: 'atualizar', path: prova.path, id: 'gp', corpo: corpoDoCortex(prova, ANO) }])
  })

  it('compromisso apagado no Google cancela a nota, sem apagar o arquivo', () => {
    const a = item({ path: 'Agenda/A.md' })
    const p = planejarSincronia({
      itens: [a], eventos: [evento({ id: 'ga', status: 'cancelled' })], mapa: { 'Agenda/A.md': ligacao(a, 'ga') }, anoAtual: ANO
    })
    expect(p.paraCortex).toEqual([{ acao: 'cancelar', path: 'Agenda/A.md' }])
    expect(p.desligar).toEqual(['Agenda/A.md'])
    expect(p.paraGoogle).toEqual([])
  })

  it('prova apagada no Google volta para o calendário', () => {
    const prova = item({ path: 'Estudos/Provas/ENEM.md', tipo: 'prova', titulo: 'ENEM' })
    const p = planejarSincronia({ itens: [prova], eventos: [], mapa: { [prova.path]: ligacao(prova, 'gp') }, anoAtual: ANO })
    expect(p.desligar).toEqual([prova.path])
    expect(p.paraGoogle.map(o => o.acao)).toEqual(['inserir'])
  })

  it('nota apagada ou cancelada no Cortex tira o evento do Google', () => {
    const a = item({ path: 'Agenda/A.md' })
    const p = planejarSincronia({ itens: [], eventos: [evento({ id: 'ga' })], mapa: { 'Agenda/A.md': ligacao(a, 'ga') }, anoAtual: ANO })
    expect(p.paraGoogle).toEqual([{ acao: 'apagar', path: 'Agenda/A.md', id: 'ga' }])
    expect(p.desligar).toEqual(['Agenda/A.md'])
  })

  it('evento criado no celular vira compromisso; repetido e sem data não', () => {
    const p = planejarSincronia({
      itens: [],
      eventos: [
        evento({ id: 'novo', summary: 'Cinema', start: { dateTime: '2026-09-25T19:00:00-03:00' }, location: 'Shopping' }),
        evento({ id: 'rep', summary: 'Academia', recurrence: ['RRULE:FREQ=WEEKLY'] }),
        evento({ id: 'semdata', start: {} })
      ],
      mapa: {}, anoAtual: ANO
    })
    expect(p.paraCortex).toEqual([{
      acao: 'criar', id: 'novo', atualizado: '2026-09-10T12:00:00.000Z',
      campos: { titulo: 'Cinema', date: '2026-09-25', hora: '19:00', local: 'Shopping' }
    }])
  })

  it('mapa perdido: religa pelo caminho que o evento carrega, sem duplicar nem importar de volta', () => {
    const a = item({ path: 'Agenda/A.md' })
    const doCortex = evento({ id: 'ga', extendedProperties: { private: { cortex: '1', cortexPath: 'Agenda/A.md' } } })
    const deNotaApagada = evento({ id: 'gx', extendedProperties: { private: { cortex: '1', cortexPath: 'Agenda/Sumiu.md' } } })
    const p = planejarSincronia({ itens: [a], eventos: [doCortex, deNotaApagada], mapa: {}, anoAtual: ANO })
    expect(p.paraGoogle).toEqual([{ acao: 'religar', path: 'Agenda/A.md', id: 'ga', corpo: corpoDoCortex(a, ANO) }])
    expect(p.paraCortex).toEqual([])
  })

  it('aplicar a edição do Google deixa o hash batendo: a rodada seguinte não devolve nada', () => {
    const a = item({ path: 'Agenda/A.md' })
    const ev = evento({ id: 'ga', summary: 'Remarcado', updated: '2026-09-11T09:00:00.000Z' })
    const p = planejarSincronia({ itens: [a], eventos: [ev], mapa: { 'Agenda/A.md': ligacao(a, 'ga') }, anoAtual: ANO })
    const op = p.paraCortex[0]
    if (op.acao !== 'atualizar') throw new Error('esperava atualizar')
    const depois = itemDepoisDoGoogle(a, op.campos)
    const mapaNovo: Mapa = { 'Agenda/A.md': { id: 'ga', hash: hashDoCorpo(corpoDoCortex(depois, ANO)!), atualizado: op.atualizado } }
    const p2 = planejarSincronia({ itens: [{ ...depois, mtime: Date.now() }], eventos: [ev], mapa: mapaNovo, anoAtual: ANO })
    expect(p2).toEqual({ paraGoogle: [], paraCortex: [], desligar: [] })
  })
})
