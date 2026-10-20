import { describe, it, expect } from 'vitest'
import { daquiPraFrente, somarDias, naJanela, listar, JANELAS } from './datas'

const HOJE = '2026-10-19'

const n = (date: string | null, title = date ?? 'sem data') => ({ date, title })

describe('daquiPraFrente', () => {
  it('hoje vem primeiro, e nao no fim', () => {
    // O bug que originou o modulo: a redacao de HOJE aparecia embaixo de
    // todas as de novembro, porque a lista era "mais recente primeiro".
    const notas = [n('2026-11-14'), n('2026-10-19'), n('2026-11-02')]
    expect(daquiPraFrente(notas, HOJE).map(x => x.date))
      .toEqual(['2026-10-19', '2026-11-02', '2026-11-14'])
  })

  it('o passado vem depois do futuro, do mais recente para o mais antigo', () => {
    const notas = [n('2026-10-10'), n('2026-10-25'), n('2026-10-18'), n('2026-10-20')]
    expect(daquiPraFrente(notas, HOJE).map(x => x.date))
      .toEqual(['2026-10-20', '2026-10-25', '2026-10-18', '2026-10-10'])
  })

  it('nota sem data vai para o fim, e NAO desaparece', () => {
    const notas = [n(null), n('2026-10-25'), n('')]
    const r = daquiPraFrente(notas, HOJE)
    expect(r).toHaveLength(3)
    expect(r[0].date).toBe('2026-10-25')
  })

  it('lista vazia nao quebra', () => {
    expect(daquiPraFrente([], HOJE)).toEqual([])
  })

  it('nao perde nem duplica nota', () => {
    const notas = [n('2026-10-01'), n('2026-12-01'), n(null), n('2026-10-19')]
    expect(daquiPraFrente(notas, HOJE)).toHaveLength(4)
  })
})

describe('somarDias', () => {
  it('soma dentro do mes', () => {
    expect(somarDias('2026-10-19', 7)).toBe('2026-10-26')
  })

  it('atravessa o mes', () => {
    expect(somarDias('2026-10-28', 7)).toBe('2026-11-04')
  })

  it('atravessa o ano', () => {
    expect(somarDias('2026-12-28', 7)).toBe('2027-01-04')
  })

  it('subtrai', () => {
    expect(somarDias('2026-11-01', -2)).toBe('2026-10-30')
  })

  it('30 dias a partir de hoje cobrem o 2o dia do ENEM', () => {
    // 15/11 e o 2o dia. Se o filtro de 30 dias nao o alcancasse, ele nao
    // apareceria em "30 dias" justamente na reta final.
    expect(somarDias(HOJE, 30) >= '2026-11-15').toBe(true)
  })
})

describe('naJanela', () => {
  const notas = [
    n('2026-10-10'), // passado
    n('2026-10-19'), // hoje
    n('2026-10-24'), // dentro de 7 dias
    n('2026-11-08'), // dentro de 30 dias
    n('2027-01-05'), // depois de 30 dias
    n(null)          // sem data
  ]

  it('a fazer: hoje e o futuro', () => {
    expect(naJanela(notas, HOJE, 'afazer').map(x => x.date))
      .toEqual(['2026-10-19', '2026-10-24', '2026-11-08', '2027-01-05', null])
  })

  it('7 dias: comeca hoje e vai para a frente', () => {
    expect(naJanela(notas, HOJE, 'semana').map(x => x.date))
      .toEqual(['2026-10-19', '2026-10-24', null])
  })

  it('30 dias', () => {
    expect(naJanela(notas, HOJE, 'mes').map(x => x.date))
      .toEqual(['2026-10-19', '2026-10-24', '2026-11-08', null])
  })

  it('passados: so o que ja foi', () => {
    expect(naJanela(notas, HOJE, 'passados').map(x => x.date))
      .toEqual(['2026-10-10', null])
  })

  it('tudo devolve a lista inteira, sem copiar', () => {
    expect(naJanela(notas, HOJE, 'tudo')).toBe(notas)
  })

  it('nota sem data sobrevive a qualquer filtro', () => {
    for (const j of JANELAS) {
      expect(naJanela(notas, HOJE, j.id).some(x => x.date === null)).toBe(true)
    }
  })
})

describe('listar', () => {
  it('filtra e ordena numa passada', () => {
    const notas = [n('2026-11-14'), n('2026-10-10'), n('2026-10-19'), n('2026-10-21')]
    expect(listar(notas, HOJE, 'semana').map(x => x.date))
      .toEqual(['2026-10-19', '2026-10-21'])
  })

  it('o padrao "a fazer" poe o de hoje no topo', () => {
    const notas = [n('2026-11-14'), n('2026-10-19')]
    expect(listar(notas, HOJE, 'afazer')[0].date).toBe('2026-10-19')
  })
})

describe('JANELAS', () => {
  it('"a fazer" e a primeira: e a pergunta da reta final', () => {
    expect(JANELAS[0].id).toBe('afazer')
  })

  it('"tudo" e a ultima, como saida de emergencia', () => {
    expect(JANELAS[JANELAS.length - 1].id).toBe('tudo')
  })
})
