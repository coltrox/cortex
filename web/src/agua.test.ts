import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { lerPendente, somarPendente, conciliarPendente, totalNaTela } from './agua'

const DIA = '2026-09-03'

describe('o que ainda não voltou do Cortex', () => {
  it('começa em zero', () => {
    expect(lerPendente(guardadoDeMemoria(), DIA)).toBe(0)
  })

  it('cada toque sobe -- é para isso que existe', () => {
    const g = guardadoDeMemoria()
    expect(somarPendente(g, DIA, 800)).toBe(800)
    expect(somarPendente(g, DIA, 800)).toBe(1600)
    expect(lerPendente(g, DIA)).toBe(1600)
  })

  it('o desfazer desce', () => {
    const g = guardadoDeMemoria()
    somarPendente(g, DIA, 800)
    expect(somarPendente(g, DIA, -800)).toBe(0)
  })

  it('sobrevive a fechar o app', () => {
    // O caso que dá o motivo do módulo: ele toca no ônibus, fecha o app, e o
    // Cortex só vai saber disso à noite. Um aparelho novo, carregado do que
    // ficou guardado, tem de abrir com os 800 ml lá.
    const g = guardadoDeMemoria()
    somarPendente(g, DIA, 800)
    const depoisDeFechar = guardadoDeMemoria({ 'cortex.agua': g.ler('cortex.agua') as string })
    expect(lerPendente(depoisDeFechar, DIA)).toBe(800)
  })

  it('o pendente de ontem não conta hoje', () => {
    const g = guardadoDeMemoria()
    somarPendente(g, '2026-09-02', 800)
    expect(lerPendente(g, DIA)).toBe(0)
  })

  it('guardado corrompido não derruba a tela', () => {
    const g = guardadoDeMemoria()
    g.gravar('cortex.agua', 'isto não é json')
    expect(lerPendente(g, DIA)).toBe(0)
    g.gravar('cortex.agua', '[1,2,3]')
    expect(lerPendente(g, DIA)).toBe(0)
    g.gravar('cortex.agua', JSON.stringify({ dia: DIA, base: 'x', delta: null }))
    expect(lerPendente(g, DIA)).toBe(0)
  })
})

describe('acertar a conta quando o cardápio volta', () => {
  it('o Cortex aplicou tudo: não sobra pendente', () => {
    const g = guardadoDeMemoria()
    somarPendente(g, DIA, 800)
    expect(conciliarPendente(g, DIA, 800)).toBe(0)
  })

  it('o Cortex aplicou metade: o resto continua esperando', () => {
    // Acontece: dois toques, e o Cortex sincronizou no meio dos dois.
    const g = guardadoDeMemoria()
    somarPendente(g, DIA, 800)
    somarPendente(g, DIA, 800)
    expect(conciliarPendente(g, DIA, 800)).toBe(800)
  })

  it('cardápio sem novidade não mexe no pendente', () => {
    // O relógio busca de dois em dois minutos com o Cortex desligado. Se cada
    // busca zerasse o pendente, o número cairia sozinho na frente do Pedro.
    const g = guardadoDeMemoria()
    somarPendente(g, DIA, 800)
    expect(conciliarPendente(g, DIA, 0)).toBe(800)
    expect(conciliarPendente(g, DIA, 0)).toBe(800)
  })

  it('acerta em cima do que já havia no vault', () => {
    const g = guardadoDeMemoria()
    conciliarPendente(g, DIA, 1600)
    somarPendente(g, DIA, 800)
    expect(conciliarPendente(g, DIA, 2400)).toBe(0)
  })

  it('o desfazer também se acerta', () => {
    const g = guardadoDeMemoria()
    conciliarPendente(g, DIA, 800)
    somarPendente(g, DIA, -800)
    expect(conciliarPendente(g, DIA, 0)).toBe(0)
  })

  it('total apagado na mão NÃO ressuscita', () => {
    // O Pedro editando o diário no Cortex, ou uma reindexação: o total do
    // vault cai sem que nenhum toque tenha saído daqui. Somar essa diferença
    // ao pendente devolveria a água que ele acabou de apagar.
    const g = guardadoDeMemoria()
    conciliarPendente(g, DIA, 2400)
    expect(conciliarPendente(g, DIA, 0)).toBe(0)
  })

  it('a conciliação nunca troca o sinal do pendente', () => {
    const g = guardadoDeMemoria()
    conciliarPendente(g, DIA, 800)
    somarPendente(g, DIA, -800)
    // O vault pulou para 3000 por fora. O total subiu, então o "−800" não foi
    // aplicado: ele continua pendente, e a tela mostra 2200. O que não pode
    // acontecer é o pendente virar positivo e recomeçar a somar água sozinho.
    expect(conciliarPendente(g, DIA, 3000)).toBe(-800)
    expect(totalNaTela(3000, -800)).toBe(2200)
  })
})

describe('o número na tela', () => {
  it('é o vault mais o que está a caminho', () => {
    expect(totalNaTela(800, 800)).toBe(1600)
  })

  it('nunca é negativo', () => {
    // A fila reenviando um "tirar" depois de o total já ter zerado.
    expect(totalNaTela(0, -800)).toBe(0)
  })

  it('número torto vira zero em vez de NaN na tela', () => {
    expect(totalNaTela(Number.NaN, 800)).toBe(800)
  })
})
