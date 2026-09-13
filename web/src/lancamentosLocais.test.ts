import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { guardarAlteracao, comAlteracoes, listaOcupada } from './lancamentosLocais'
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

  it('trava as outras linhas do mesmo dia enquanto uma alteracao nao volta', () => {
    const g = guardadoDeMemoria()
    guardarAlteracao(g, { chave: t(0, 'almoço', 20).chave, antes: { item: 'almoço', valor: 20 }, novo: null })
    expect(listaOcupada(g, t(1, 'uber', 15))).toBe(true)
    expect(listaOcupada(g, t(0, 'almoço', 20))).toBe(false)
    expect(listaOcupada(g, { ...t(0, 'mercado', 80), chave: '2026-09-12#transacoes#0', data: '2026-09-12' })).toBe(false)
  })

  it('armazenamento torto nao derruba a tela', () => {
    const g = guardadoDeMemoria({ 'cortex.lancamentos-alterados': 'nao e json' })
    expect(comAlteracoes(g, [t(0, 'almoço', 20)]).map(x => x.item)).toEqual(['almoço'])
  })
})
