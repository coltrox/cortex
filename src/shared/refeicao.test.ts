import { describe, it, expect } from 'vitest'
import { opcoesDaRefeicao, resumoDaRefeicao } from './refeicao'

describe('as opcoes de uma refeicao', () => {
  it('quebra no OU da nutricionista', () => {
    const r = opcoesDaRefeicao('2 ovos inteiros mexidos OU 30 g de whey batido com água')
    expect(r).toEqual([
      { texto: '2 ovos inteiros mexidos' },
      { texto: '30 g de whey batido com água' }
    ])
  })

  it('texto sem alternativa volta inteiro, numa opcao so', () => {
    expect(opcoesDaRefeicao('Chá desincha. Água o tempo todo'))
      .toEqual([{ texto: 'Chá desincha. Água o tempo todo' }])
  })

  it('opcoes numeradas: o recado antes delas vira introducao', () => {
    const r = opcoesDaRefeicao('Só UMA destas: (1) sopa de legumes; (2) 2 fatias de pizza; (3) lanche natural')
    expect(r[0]).toEqual({ texto: 'sopa de legumes', intro: 'Só UMA destas' })
    expect(r.map(x => x.texto)).toEqual(['sopa de legumes', '2 fatias de pizza', 'lanche natural'])
  })

  it('nao confunde "ou" minusculo no meio da frase', () => {
    expect(opcoesDaRefeicao('1 colher de vegetal cozido ou refogado com azeite'))
      .toEqual([{ texto: '1 colher de vegetal cozido ou refogado com azeite' }])
  })

  it('vazio e espaço em branco nao viram opcao', () => {
    expect(opcoesDaRefeicao('')).toEqual([])
    expect(opcoesDaRefeicao('   ')).toEqual([])
    expect(opcoesDaRefeicao('pão OU  OU banana').map(x => x.texto)).toEqual(['pão', 'banana'])
  })
})

describe('o resumo do cartao fechado', () => {
  it('conta as outras opcoes', () => {
    expect(resumoDaRefeicao('2 ovos OU 30 g de whey')).toBe('2 ovos · +1 opção')
    expect(resumoDaRefeicao('a OU b OU c')).toBe('a · +2 opções')
  })

  it('corta o que passa do limite', () => {
    expect(resumoDaRefeicao('a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`)
  })

  it('sem itens, sem resumo', () => {
    expect(resumoDaRefeicao('')).toBe('')
  })
})

describe('a parte fixa antes das alternativas', () => {
  it('o que vem antes dos dois-pontos vira introducao', () => {
    const r = opcoesDaRefeicao('300 ml de água com creatina. Depois: 2 ovos mexidos OU 30 g de whey')
    expect(r[0].intro).toBe('300 ml de água com creatina. Depois')
    expect(r.map(x => x.texto)).toEqual(['2 ovos mexidos', '30 g de whey'])
  })

  it('dois-pontos sem alternativa nenhuma nao corta o texto', () => {
    expect(opcoesDaRefeicao('Regra: comer devagar e sem líquidos'))
      .toEqual([{ texto: 'Regra: comer devagar e sem líquidos' }])
  })
})
