import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { guardarAlteracao, comAlteracoes, chaveEfetiva } from './lancamentosLocais'
import type { Transacao } from './cardapio'

const t = (i: number, item: string, valor: number): Transacao => ({
  chave: `2026-09-13#transacoes#${i}`, data: '2026-09-13', item, valor, cat: '', entrada: false
})

describe('lancamento editado ou excluido no celular', () => {
  it('excluir some da lista no mesmo toque', () => {
    const g = guardadoDeMemoria()
    const lista = [t(0, 'almoço', 20), t(1, 'uber', 15)]
    guardarAlteracao(g, { chave: lista[0].chave, antes: { item: 'almoço', valor: 20 }, novo: null })
    expect(comAlteracoes(g, lista).map(x => x.item)).toEqual(['uber'])
  })

  it('editar mostra o valor novo no mesmo toque', () => {
    const g = guardadoDeMemoria()
    const lista = [t(0, 'almoço', 20)]
    guardarAlteracao(g, {
      chave: lista[0].chave, antes: { item: 'almoço', valor: 20 },
      novo: { item: 'almoço', valor: 25, cat: 'comida', entrada: false }
    })
    expect(comAlteracoes(g, lista)[0]).toMatchObject({ valor: 25, cat: 'comida' })
  })

  it('editar duas vezes antes de voltar mostra a ultima, sem piscar a original', () => {
    // A segunda alteracao chega com `antes` = o que a tela mostrava (a
    // primeira edicao). A marca local guarda o `antes` da PRIMEIRA, que e o
    // que ainda esta publicado.
    const g = guardadoDeMemoria()
    const lista = [t(0, 'almoço', 20)]
    guardarAlteracao(g, {
      chave: lista[0].chave, antes: { item: 'almoço', valor: 20 },
      novo: { item: 'almoço', valor: 25, cat: '', entrada: false }
    })
    guardarAlteracao(g, {
      chave: lista[0].chave, antes: { item: 'almoço', valor: 25 },
      novo: { item: 'almoço', valor: 30, cat: '', entrada: false }
    })
    expect(comAlteracoes(g, lista)[0].valor).toBe(30)
  })

  it('depois que o Cortex apaga, a linha que andou para a posicao NAO some', () => {
    // O defeito que a conferencia do `antes` evita: a chave e posicao, e o
    // "uber" passa a morar na posicao 0 depois que o almoço sai.
    const g = guardadoDeMemoria()
    guardarAlteracao(g, { chave: t(0, 'almoço', 20).chave, antes: { item: 'almoço', valor: 20 }, novo: null })
    const publicadoDepois = [t(0, 'uber', 15)]
    expect(comAlteracoes(g, publicadoDepois).map(x => x.item)).toEqual(['uber'])
  })

  it('a ponte fecha: o que o Cortex ja aplicou sai do armazenamento', () => {
    const g = guardadoDeMemoria()
    guardarAlteracao(g, { chave: t(0, 'almoço', 20).chave, antes: { item: 'almoço', valor: 20 }, novo: null })
    comAlteracoes(g, [t(0, 'uber', 15)])
    // Com a marca apagada, a lista publicada volta a valer inteira.
    expect(comAlteracoes(g, [t(0, 'almoço', 20)]).map(x => x.item)).toEqual(['almoço'])
  })

  it('com uma exclusao pendente antes, a linha anda uma casa -- e continua clicavel', () => {
    // Existia uma trava aqui, e ela prendia a tela: excluir um lancamento
    // deixava os outros do dia sem botao ate o Cortex devolver.
    const g = guardadoDeMemoria()
    guardarAlteracao(g, { chave: t(0, 'almoço', 20).chave, antes: { item: 'almoço', valor: 20 }, novo: null })
    expect(chaveEfetiva(g, t(2, 'venda', 100))).toBe('2026-09-13#transacoes#1')
    expect(chaveEfetiva(g, t(1, 'venda', 10))).toBe('2026-09-13#transacoes#0')
  })

  it('duas exclusoes antes descontam duas; edicao nao desconta', () => {
    const g = guardadoDeMemoria()
    guardarAlteracao(g, { chave: t(0, 'a', 1).chave, antes: { item: 'a', valor: 1 }, novo: null })
    guardarAlteracao(g, { chave: t(1, 'b', 2).chave, antes: { item: 'b', valor: 2 }, novo: null })
    guardarAlteracao(g, {
      chave: t(2, 'c', 3).chave, antes: { item: 'c', valor: 3 },
      novo: { item: 'c', valor: 4, cat: '', entrada: false }
    })
    expect(chaveEfetiva(g, t(3, 'd', 5))).toBe('2026-09-13#transacoes#1')
  })

  it('exclusao de outro dia, ou depois da linha, nao mexe na posicao', () => {
    const g = guardadoDeMemoria()
    guardarAlteracao(g, { chave: '2026-09-12#transacoes#0', antes: { item: 'x', valor: 1 }, novo: null })
    guardarAlteracao(g, { chave: t(5, 'y', 2).chave, antes: { item: 'y', valor: 2 }, novo: null })
    expect(chaveEfetiva(g, t(2, 'venda', 100))).toBe('2026-09-13#transacoes#2')
  })

  it('armazenamento torto nao derruba a tela', () => {
    const g = guardadoDeMemoria({ 'cortex.lancamentos-alterados': 'nao e json' })
    expect(comAlteracoes(g, [t(0, 'almoço', 20)]).map(x => x.item)).toEqual(['almoço'])
  })
})
