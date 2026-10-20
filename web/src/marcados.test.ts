import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  chaveDaTarefa, lerMarcados, gravarMarcados, alternar, estaFeita
} from './marcados'

describe('chaveDaTarefa', () => {
  it('junta nota e posicao', () => {
    expect(chaveDaTarefa('20/10 ter', 2)).toBe('20/10 ter#2')
  })

  it('notas diferentes nao compartilham marcacao', () => {
    expect(chaveDaTarefa('20/10 ter', 0)).not.toBe(chaveDaTarefa('21/10 qua', 0))
  })
})

describe('alternar', () => {
  it('marca o que nao estava marcado', () => {
    expect(alternar({}, 'a#0')).toEqual({ 'a#0': true })
  })

  it('desmarca REMOVENDO a chave, para o mapa nao crescer para sempre', () => {
    expect(alternar({ 'a#0': true }, 'a#0')).toEqual({})
  })

  it('nao mexe nas outras tarefas', () => {
    expect(alternar({ 'a#0': true, 'b#1': true }, 'a#0')).toEqual({ 'b#1': true })
  })

  it('nao altera o mapa recebido', () => {
    const antes: Record<string, true> = { 'a#0': true }
    alternar(antes, 'a#0')
    expect(antes).toEqual({ 'a#0': true })
  })
})

describe('estaFeita', () => {
  it('o [x] do arquivo vence a marcacao local', () => {
    // Se o Cortex ja marcou no vault, esta feito — mesmo sem marcacao aqui.
    expect(estaFeita({}, 'a#0', true)).toBe(true)
  })

  it('marcacao local vale quando o arquivo nao marcou', () => {
    expect(estaFeita({ 'a#0': true }, 'a#0', false)).toBe(true)
  })

  it('sem nenhum dos dois, nao esta feita', () => {
    expect(estaFeita({}, 'a#0', false)).toBe(false)
  })
})

describe('persistencia', () => {
  it('grava e le de volta', () => {
    const g = guardadoDeMemoria()
    gravarMarcados(g, { 'a#0': true })
    expect(lerMarcados(g)).toEqual({ 'a#0': true })
  })

  it('sem nada guardado comeca vazio', () => {
    expect(lerMarcados(guardadoDeMemoria())).toEqual({})
  })

  it('JSON torto nao quebra a nota', () => {
    expect(lerMarcados(guardadoDeMemoria({ 'cortex.marcados': '{ nao e json' }))).toEqual({})
    expect(lerMarcados(guardadoDeMemoria({ 'cortex.marcados': '[1,2]' }))).toEqual({})
  })

  it('valor que nao e true e descartado', () => {
    const g = guardadoDeMemoria({
      'cortex.marcados': JSON.stringify({ 'a#0': 'sim', 'b#0': true })
    })
    expect(lerMarcados(g)).toEqual({ 'b#0': true })
  })
})
