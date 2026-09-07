import { describe, it, expect } from 'vitest'
import {
  pascoa, nacionais, facultativos, estaduaisSP, municipaisCampinas, feriadosDoAno
} from './feriados'

/** Acha uma data pelo nome, para os testes lerem como frase. */
const quando = (lista: { data: string; nome: string }[], nome: string): string | undefined =>
  lista.find(f => f.nome === nome)?.data

describe('pascoa', () => {
  it('bate com os domingos de Pascoa conhecidos', () => {
    // Sao datas publicadas, nao calculadas por mim: se o algoritmo for
    // transcrito errado, e aqui que aparece.
    expect(pascoa(2024)).toEqual({ mes: 3, dia: 31 })
    expect(pascoa(2025)).toEqual({ mes: 4, dia: 20 })
    expect(pascoa(2026)).toEqual({ mes: 4, dia: 5 })
    expect(pascoa(2027)).toEqual({ mes: 3, dia: 28 })
    expect(pascoa(2028)).toEqual({ mes: 4, dia: 16 })
  })

  it('acerta os extremos da janela', () => {
    // 22 de marco e 25 de abril sao o mais cedo e o mais tarde possiveis.
    // Um algoritmo quase certo costuma errar exatamente aqui.
    expect(pascoa(2000)).toEqual({ mes: 4, dia: 23 })
    expect(pascoa(2038)).toEqual({ mes: 4, dia: 25 })
    expect(pascoa(2285)).toEqual({ mes: 3, dia: 22 })
  })
})

describe('as datas que dependem da Pascoa', () => {
  it('caem onde devem em 2026', () => {
    // Pascoa 2026 e 5 de abril.
    expect(quando(nacionais(2026), 'Sexta-feira Santa')).toBe('2026-04-03')
    expect(quando(facultativos(2026), 'Carnaval')).toBe('2026-02-17')
    expect(quando(facultativos(2026), 'Quarta-feira de Cinzas')).toBe('2026-02-18')
    expect(quando(facultativos(2026), 'Corpus Christi')).toBe('2026-06-04')
  })

  it('atravessa fevereiro de ano bissexto sem escorregar', () => {
    // O Carnaval de 2028 cai em 29 de fevereiro. Uma conta de dias que
    // ignore o ano bissexto erra este por um dia e acerta todos os outros.
    expect(quando(facultativos(2028), 'Carnaval')).toBe('2028-02-29')
  })

  it('atravessa a virada de mes em outro ano', () => {
    expect(quando(facultativos(2027), 'Corpus Christi')).toBe('2027-05-27')
  })
})

describe('as listas fixas', () => {
  it('tem os dez feriados nacionais, com a Consciencia Negra', () => {
    const n = nacionais(2026)
    expect(n).toHaveLength(10)
    expect(quando(n, 'Consciência Negra')).toBe('2026-11-20')
    expect(quando(n, 'Nossa Senhora Aparecida')).toBe('2026-10-12')
    expect(quando(n, 'Natal')).toBe('2026-12-25')
    // Todos sao feriado de lei, e nenhum e facultativo.
    expect(n.every(f => f.especie === 'feriado')).toBe(true)
  })

  it('Carnaval e Corpus Christi sao facultativos, nao feriados', () => {
    // Todo mundo fecha, e mesmo assim a diferenca importa: e ela que decide
    // se um prazo corre.
    expect(facultativos(2026).every(f => f.especie === 'facultativo')).toBe(true)
    expect(quando(nacionais(2026), 'Carnaval')).toBeUndefined()
    expect(quando(nacionais(2026), 'Corpus Christi')).toBeUndefined()
  })

  it('Sao Paulo tem o 9 de julho', () => {
    expect(quando(estaduaisSP(2026), 'Revolução Constitucionalista')).toBe('2026-07-09')
  })

  it('Campinas tem 8 de dezembro, e so', () => {
    const c = municipaisCampinas(2026)
    expect(c).toHaveLength(1)
    expect(c[0].data).toBe('2026-12-08')
    expect(c[0].lei).toBe('Lei municipal 173/1949')
  })

  it('14 de julho NAO e feriado em Campinas', () => {
    // Aniversario da cidade e data comemorativa, nao feriado: comercio abre e
    // prazo corre. Quase todo site de feriado erra isto, e a advogada que usa
    // o app conta prazo por aqui. Este teste existe para que ninguem
    // "conserte" a ausencia.
    expect(feriadosDoAno(2026).has('2026-07-14')).toBe(false)
  })
})

describe('feriadosDoAno', () => {
  it('indexa por data', () => {
    const m = feriadosDoAno(2026)
    expect(m.get('2026-04-21')?.map(f => f.nome)).toEqual(['Tiradentes'])
    expect(m.get('2026-12-08')?.[0].abrangencia).toBe('municipal')
    expect(m.get('2026-03-15')).toBeUndefined()
  })

  it('quando dois caem no mesmo dia, o feriado vem antes do facultativo', () => {
    // Se os dois se encontram, quem manda no prazo e o feriado — entao e ele
    // que a tela mostra primeiro.
    for (const [, lista] of feriadosDoAno(2026)) {
      const primeiroFacultativo = lista.findIndex(f => f.especie === 'facultativo')
      const ultimoFeriado = lista.map(f => f.especie).lastIndexOf('feriado')
      if (primeiroFacultativo !== -1 && ultimoFeriado !== -1) {
        expect(ultimoFeriado).toBeLessThan(primeiroFacultativo)
      }
    }
  })

  it('todo item sabe a lei que o criou', () => {
    for (const [, lista] of feriadosDoAno(2026)) {
      for (const f of lista) expect(f.lei).not.toBe('')
    }
  })
})
