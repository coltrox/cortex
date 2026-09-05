import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { lerAnotacoes, guardarAnotacao, conciliarAnotacoes } from './anotacoes'

const DIA = '2026-09-04'
const ONTEM = '2026-09-03'

describe('as anotações que este aparelho escreveu', () => {
  it('começa sem nenhuma', () => {
    expect(lerAnotacoes(guardadoDeMemoria(), DIA)).toEqual([])
  })

  it('guarda na ordem em que foram escritas', () => {
    // A ordem importa: é a única cronologia que existe aqui. A nota no vault
    // guarda só o DIA, então depois que ela dá a volta essa ordem se perde.
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'primeira', false)
    guardarAnotacao(g, DIA, 'segunda', false)
    expect(lerAnotacoes(g, DIA).map(a => a.texto)).toEqual(['primeira', 'segunda'])
  })

  it('leva a marca de prioridade junto', () => {
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'ligar pro dentista', true)
    expect(lerAnotacoes(g, DIA)).toEqual([{ texto: 'ligar pro dentista', prioridade: true }])
  })

  it('sobrevive a fechar o app', () => {
    // O caso que dá o motivo do módulo: ele escreve no ônibus, com o Cortex
    // desligado. Se isto não sobrevivesse, a anotação sumiria da tela e ele
    // não teria como saber se ela saiu.
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'comprar caderno', false)
    expect(lerAnotacoes(g, DIA)).toHaveLength(1)
  })

  it('texto em branco não vira anotação', () => {
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, '   ', false)
    expect(lerAnotacoes(g, DIA)).toEqual([])
  })

  it('guarda só o dia da última gravação', () => {
    // Mesma poda de `feitos.ts`: o passado está no vault, e um mapa que cresce
    // para sempre é a maneira de estourar o `localStorage` sem perceber.
    const g = guardadoDeMemoria()
    guardarAnotacao(g, ONTEM, 'de ontem', false)
    guardarAnotacao(g, DIA, 'de hoje', false)
    expect(lerAnotacoes(g, ONTEM)).toEqual([])
    expect(lerAnotacoes(g, DIA).map(a => a.texto)).toEqual(['de hoje'])
  })

  it('lixo guardado na chave não derruba a tela', () => {
    const g = guardadoDeMemoria()
    g.gravar('cortex.anotacoes', 'isto nao e json')
    expect(lerAnotacoes(g, DIA)).toEqual([])
    g.gravar('cortex.anotacoes', JSON.stringify({ [DIA]: ['texto solto', { texto: 'boa' }, null] }))
    expect(lerAnotacoes(g, DIA)).toEqual([{ texto: 'boa', prioridade: false }])
  })
})

describe('conciliar com o que o Cortex devolveu', () => {
  it('a que voltou sai da memória local', () => {
    // Sem isto ela apareceria duas vezes: uma vinda do vault, outra da cópia
    // local que ninguém apagou.
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'fui bem no simulado', false)
    guardarAnotacao(g, DIA, 'dormi mal', false)

    const restam = conciliarAnotacoes(g, DIA, ['fui bem no simulado'])
    expect(restam.map(a => a.texto)).toEqual(['dormi mal'])
    expect(lerAnotacoes(g, DIA).map(a => a.texto)).toEqual(['dormi mal'])
  })

  it('a que ainda não voltou fica', () => {
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'comprar caderno', false)
    expect(conciliarAnotacoes(g, DIA, []).map(a => a.texto)).toEqual(['comprar caderno'])
  })

  it('casa mesmo com espaço sobrando de um lado', () => {
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'treinei pesado', false)
    expect(conciliarAnotacoes(g, DIA, ['  treinei pesado  '])).toEqual([])
  })

  it('duas anotações que começam igual não se apagam', () => {
    // A comparação é pelo TEXTO inteiro, e não pelo título -- o título é a
    // primeira linha cortada em 60 caracteres, então estas duas teriam o
    // mesmo, e a que ainda não chegou sumiria como se tivesse chegado.
    const g = guardadoDeMemoria()
    guardarAnotacao(g, DIA, 'Lembrar de pagar a conta de luz', false)
    guardarAnotacao(g, DIA, 'Lembrar de pagar a conta do cartão', false)

    const restam = conciliarAnotacoes(g, DIA, ['Lembrar de pagar a conta de luz'])
    expect(restam.map(a => a.texto)).toEqual(['Lembrar de pagar a conta do cartão'])
  })
})
