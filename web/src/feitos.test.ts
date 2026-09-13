import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { jaFeitos, marcarFeito, chaveApagado, foiApagado, conciliarApagados } from './feitos'

const DIA = '2026-09-13'

/*
 * Excluir no celular: o item some na hora.
 *
 * Antes ele ficava na lista riscado, escrito "excluido", ate o Cortex
 * republicar o cardapio -- com o computador desligado, ate o dia seguinte.
 */
describe('item apagado neste aparelho', () => {
  it('a marca responde por ele, e so por ele', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, chaveApagado('Agenda/niver2 namoro.md'))
    const feitos = jaFeitos(g, DIA)
    expect(foiApagado(feitos, 'Agenda/niver2 namoro.md')).toBe(true)
    expect(foiApagado(feitos, 'Agenda/niver namoro.md')).toBe(false)
    // O pendente local nao tem caminho, e nao pode sumir por engano.
    expect(foiApagado(feitos, '')).toBe(false)
    expect(foiApagado(feitos, undefined)).toBe(false)
  })

  it('a marca cai quando o cardapio volta sem o item -- o Cortex confirmou', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, chaveApagado('Agenda/x.md'))
    marcarFeito(g, DIA, 'suplemento:Creatina')
    expect(conciliarApagados(g, DIA, ['Agenda/y.md', ''])).toBe(true)
    // So a marca de apagado sai; os checks do dia ficam.
    expect(jaFeitos(g, DIA)).toEqual(['suplemento:Creatina'])
  })

  it('enquanto o item ainda vem no cardapio, a marca fica', () => {
    // O Cortex pode republicar antes de processar a exclusao.
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, chaveApagado('Agenda/x.md'))
    expect(conciliarApagados(g, DIA, ['Agenda/x.md', 'Vida/nota.md'])).toBe(false)
    expect(jaFeitos(g, DIA)).toEqual([chaveApagado('Agenda/x.md')])
  })

  it('cardapio vazio nao confirma nada', () => {
    // Antes de o cardapio carregar a lista esta vazia; soltar a marca ai
    // traria o item apagado de volta assim que o cardapio de verdade chegasse.
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, chaveApagado('Agenda/x.md'))
    expect(conciliarApagados(g, DIA, [])).toBe(false)
    expect(conciliarApagados(g, DIA, [''])).toBe(false)
    expect(foiApagado(jaFeitos(g, DIA), 'Agenda/x.md')).toBe(true)
  })
})
