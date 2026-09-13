import { describe, it, expect } from 'vitest'
import { proximaOcorrencia, anosCompletados, anoDeOrigem, bissexto, diasNoMes } from './datas'

describe('bissexto', () => {
  it('nao e so divisivel por 4', () => {
    // 1900 e 2100 sao divisiveis por 4 e NAO sao bissextos; 2000 e.
    expect(bissexto(2024)).toBe(true)
    expect(bissexto(2026)).toBe(false)
    expect(bissexto(1900)).toBe(false)
    expect(bissexto(2000)).toBe(true)
    expect(bissexto(2100)).toBe(false)
  })
})

describe('diasNoMes', () => {
  it('fevereiro depende do ano', () => {
    expect(diasNoMes(2, 2024)).toBe(29)
    expect(diasNoMes(2, 2026)).toBe(28)
  })

  it('os de 30 e os de 31', () => {
    expect(diasNoMes(4, 2026)).toBe(30)
    expect(diasNoMes(12, 2026)).toBe(31)
  })
})

describe('proximaOcorrencia', () => {
  const HOJE = '2026-09-07'

  it('ainda neste ano, se a data nao passou', () => {
    expect(proximaOcorrencia(27, 9, HOJE)).toBe('2026-09-27')
  })

  it('ano que vem, se ja passou', () => {
    expect(proximaOcorrencia(3, 5, HOJE)).toBe('2027-05-03')
  })

  it('HOJE conta como proxima', () => {
    // Quem faz aniversario hoje quer ver hoje, nao no ano que vem.
    expect(proximaOcorrencia(7, 9, HOJE)).toBe('2026-09-07')
  })

  it('ontem cai no ano que vem', () => {
    expect(proximaOcorrencia(6, 9, HOJE)).toBe('2027-09-06')
  })

  it('29 de fevereiro cai no dia 28 em ano comum', () => {
    // 2027 nao e bissexto. Comemora dentro de fevereiro, e nao em 1o de
    // marco: quem nasceu em fevereiro comemora em fevereiro.
    expect(proximaOcorrencia(29, 2, '2026-09-07')).toBe('2027-02-28')
    // Em ano bissexto, o dia existe de verdade.
    expect(proximaOcorrencia(29, 2, '2024-01-01')).toBe('2024-02-29')
  })

  it('31 num mes de 30 NAO encolhe -- e erro de digitacao', () => {
    // A diferenca com o 29/02: aquele existe em alguns anos, entao encolher e
    // respeitar a data. `31/04` nao existe em ano nenhum -- quem digitou 31
    // para abril errou, e mostrar 30 de abril esconderia o erro em vez de
    // deixar a pessoa corrigir.
    expect(proximaOcorrencia(31, 4, '2026-01-01')).toBeNull()
    expect(proximaOcorrencia(31, 6, '2026-01-01')).toBeNull()
    expect(proximaOcorrencia(30, 4, '2026-01-01')).toBe('2026-04-30')
  })

  it('vira o ano corretamente em 31 de dezembro', () => {
    expect(proximaOcorrencia(31, 12, '2026-12-31')).toBe('2026-12-31')
    expect(proximaOcorrencia(1, 1, '2026-12-31')).toBe('2027-01-01')
  })

  it('data que nao existe devolve null', () => {
    // Inventar 3 de marco para `31/02` seria pior do que nao mostrar nada.
    expect(proximaOcorrencia(31, 2, HOJE)).toBeNull()
    expect(proximaOcorrencia(0, 5, HOJE)).toBeNull()
    expect(proximaOcorrencia(15, 13, HOJE)).toBeNull()
    expect(proximaOcorrencia(15, 0, HOJE)).toBeNull()
  })

  it('numero quebrado nao vira data', () => {
    // O campo e digitado a mao, e o frontmatter aceita qualquer coisa.
    expect(proximaOcorrencia(1.5, 5, HOJE)).toBeNull()
    expect(proximaOcorrencia(NaN, 5, HOJE)).toBeNull()
  })
})

describe('anosCompletados', () => {
  it('conta os anos entre a origem e a ocorrencia', () => {
    expect(anosCompletados(2008, '2026-09-27')).toBe(18)
    expect(anosCompletados(2023, '2026-05-03')).toBe(3)
  })

  it('sem ano de origem, null', () => {
    // Aniversario sem ano e comum: nem sempre se sabe, e nem sempre se conta.
    expect(anosCompletados(undefined, '2026-09-27')).toBeNull()
    expect(anosCompletados(null, '2026-09-27')).toBeNull()
    expect(anosCompletados('1990', '2026-09-27')).toBeNull()
  })

  it('ano implausivel nao vira conta na tela', () => {
    // Digitar `19` em vez de `1990` daria "2007 anos".
    expect(anosCompletados(19, '2026-09-27')).toBeNull()
    expect(anosCompletados(20260, '2026-09-27')).toBeNull()
  })

  it('origem no futuro nao vira idade negativa', () => {
    expect(anosCompletados(2030, '2026-09-27')).toBeNull()
  })
})

describe('anoDeOrigem', () => {
  it('ano anterior ao corrente vale', () => {
    expect(anoDeOrigem(1983, '2026-09-12')).toBe(1983)
    expect(anoDeOrigem(2025, '2026-09-12')).toBe(2025)
  })

  it('o ano corrente e o padrao do seletor, nao um fato', () => {
    expect(anoDeOrigem(2026, '2026-09-12')).toBeUndefined()
  })

  it('futuro, implausivel ou quebrado nao vale', () => {
    expect(anoDeOrigem(2030, '2026-09-12')).toBeUndefined()
    expect(anoDeOrigem(1850, '2026-09-12')).toBeUndefined()
    expect(anoDeOrigem(NaN, '2026-09-12')).toBeUndefined()
  })
})
