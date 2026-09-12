import { describe, it, expect } from 'vitest'
import { montarIcs, type EventoIcs } from './ics'

/**
 * O formato iCalendar e antigo e cheio de regras bobas. Errar qualquer uma
 * faz o calendario INTEIRO ser recusado em silencio pelo Google e pelo
 * iPhone -- nao aparece erro, so nao aparece nada. E por isso que isto tem
 * teste, e por isso que ele checa as regras uma a uma.
 */
const AGORA = new Date(Date.UTC(2026, 8, 11, 15, 30, 0))
const ics = (eventos: EventoIcs[]): string => montarIcs(eventos, { agora: AGORA })
const linhas = (s: string): string[] => s.split('\r\n')
const octetos = (s: string): number => new TextEncoder().encode(s).length

const PROVA: EventoIcs = { id: 'p1', titulo: 'Prova de fisica', data: '2026-10-18' }

describe('montarIcs — o esqueleto', () => {
  it('abre e fecha o calendario', () => {
    const s = ics([])
    expect(linhas(s)[0]).toBe('BEGIN:VCALENDAR')
    expect(s.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })

  it('termina cada linha em CRLF, inclusive a ultima', () => {
    // Alguns clientes recusam o arquivo sem a quebra final.
    const s = ics([PROVA])
    expect(s.endsWith('\r\n')).toBe(true)
    expect(s.includes('\n\n')).toBe(false)
  })

  it('declara versao e produto', () => {
    const s = ics([])
    expect(s).toContain('VERSION:2.0')
    expect(s).toContain('PRODID:-//Cortex//Agenda//PT')
  })

  it('calendario vazio continua valido', () => {
    // Vault novo, sem nada marcado: o endereco tem que devolver um calendario
    // vazio, e nao um erro -- senao a assinatura quebraria no dia em que a
    // agenda esvazia.
    const s = ics([])
    expect(s).toContain('BEGIN:VCALENDAR')
    expect(s).not.toContain('BEGIN:VEVENT')
  })
})

describe('montarIcs — o evento', () => {
  it('dia inteiro vai sem hora, e termina no dia SEGUINTE', () => {
    // `DTEND` e exclusivo no formato: sem o dia seguinte o Google desenha um
    // evento de zero dias e alguns clientes nem o mostram.
    const s = ics([PROVA])
    expect(s).toContain('DTSTART;VALUE=DATE:20261018')
    expect(s).toContain('DTEND;VALUE=DATE:20261019')
  })

  it('a virada do mes e do ano tambem anda um dia', () => {
    expect(ics([{ ...PROVA, data: '2026-10-31' }])).toContain('DTEND;VALUE=DATE:20261101')
    expect(ics([{ ...PROVA, data: '2026-12-31' }])).toContain('DTEND;VALUE=DATE:20270101')
    // Ano bissexto: 2028 tem 29 de fevereiro.
    expect(ics([{ ...PROVA, data: '2028-02-28' }])).toContain('DTEND;VALUE=DATE:20280229')
  })

  it('com hora vira um horario marcado, sem DTEND de dia inteiro', () => {
    const s = ics([{ id: 'c1', titulo: 'Dentista', data: '2026-09-12', hora: '14:30' }])
    expect(s).toContain('DTSTART:20260912T143000')
    expect(s).not.toContain('DTEND;VALUE=DATE')
  })

  it('a data comemorativa repete todo ano', () => {
    const s = ics([{ id: 'a1', titulo: 'Aniversário da mãe', data: '2026-12-20', anual: true }])
    expect(s).toContain('RRULE:FREQ=YEARLY')
  })

  it('o UID e estavel: e como o calendario sabe que e o mesmo evento', () => {
    expect(ics([PROVA])).toContain('UID:p1@cortex')
  })

  it('o carimbo vem de quem chama, e nao do relogio', () => {
    expect(ics([PROVA])).toContain('DTSTAMP:20260911T153000Z')
  })
})

describe('montarIcs — o que o formato reserva', () => {
  it('virgula e ponto e virgula saem escapados', () => {
    const s = ics([{ id: 'x', titulo: 'Prova de fisica, quimica; e biologia', data: '2026-10-18' }])
    expect(s).toContain('SUMMARY:Prova de fisica\\, quimica\\; e biologia')
  })

  it('quebra de linha vira \\n, e nao uma linha nova de verdade', () => {
    // Uma quebra crua ali encerraria a propriedade, e o resto do texto viraria
    // uma linha invalida no meio do evento.
    const s = ics([{
      id: 'x', titulo: 'Prova', data: '2026-10-18', descricao: 'sala 3\nlevar caneta'
    }])
    expect(s).toContain('DESCRIPTION:sala 3\\nlevar caneta')
  })

  it('a barra invertida e escapada primeiro, sem escapar o proprio escape', () => {
    const s = ics([{ id: 'x', titulo: 'a\\b', data: '2026-10-18' }])
    expect(s).toContain('SUMMARY:a\\\\b')
  })
})

describe('montarIcs — a dobra de linha', () => {
  it('nenhuma linha passa de 75 octetos', () => {
    const s = ics([{
      id: 'longo',
      titulo: 'Aniversário de casamento dos meus avós que moram em São José dos Campos',
      data: '2026-12-20',
      descricao: 'Levar o presente que ficou guardado no armário do quarto de hóspedes'
    }])
    for (const l of linhas(s)) expect(octetos(l), l).toBeLessThanOrEqual(75)
  })

  it('a continuacao comeca com espaco', () => {
    const s = ics([{ id: 'x', titulo: 'a'.repeat(200), data: '2026-10-18' }])
    const i = linhas(s).findIndex(l => l.startsWith('SUMMARY:'))
    expect(linhas(s)[i + 1].startsWith(' ')).toBe(true)
  })

  it('conta OCTETOS, e nao letras -- quase todo titulo daqui tem acento', () => {
    // "á" tem uma letra e dois bytes. Cortar por letra estouraria o limite.
    const s = ics([{ id: 'x', titulo: 'á'.repeat(60), data: '2026-10-18' }])
    for (const l of linhas(s)) expect(octetos(l)).toBeLessThanOrEqual(75)
  })

  it('nao corta no meio de um caractere de varios bytes', () => {
    // Se cortasse, o texto voltaria com um losango de erro no lugar da letra.
    const s = ics([{ id: 'x', titulo: 'ção '.repeat(40), data: '2026-10-18' }])
    expect(s).not.toContain('�')
  })
})

describe('montarIcs — o que nao vira evento', () => {
  it('data torta e descartada, e nao quebra o resto', () => {
    const s = ics([{ id: 'a', titulo: 'Sem data', data: '' }, PROVA])
    expect(s).toContain('Prova de fisica')
    expect(s).not.toContain('Sem data')
  })

  it('titulo em branco nao vira evento vazio no calendario', () => {
    expect(ics([{ id: 'a', titulo: '   ', data: '2026-10-18' }])).not.toContain('BEGIN:VEVENT')
  })

  it('hora fora do formato cai para dia inteiro, em vez de gerar lixo', () => {
    const s = ics([{ id: 'a', titulo: 'Dentista', data: '2026-09-12', hora: 'de tarde' }])
    expect(s).toContain('DTSTART;VALUE=DATE:20260912')
  })
})
