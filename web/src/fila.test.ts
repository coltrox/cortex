import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { Fila } from './fila'
import { ErroDeDado, ErroDeRede } from './erros'
import type { Evento } from '@compartilhado/eventos'

const evento = (nome: string): Evento => ({
  tipo: 'suplemento', dia: '2026-08-28', dados: { nome }
})

/** Ids previsíveis: sem isso os testes não conseguem falar sobre um item. */
function filaDeTeste(inicial: Record<string, string> = {}) {
  let n = 0
  const g = guardadoDeMemoria(inicial)
  return { g, fila: new Fila(g, () => `id${++n}`) }
}

describe('Fila', () => {
  it('começa vazia', () => {
    expect(filaDeTeste().fila.quantos()).toBe(0)
  })

  it('enfileira na ordem de chegada', () => {
    const { fila } = filaDeTeste()
    fila.enfileirar(evento('creatina'))
    fila.enfileirar(evento('whey'))
    expect(fila.itens().map(i => i.evento.dados.nome)).toEqual(['creatina', 'whey'])
  })

  it('sobrevive a recarregar a página', () => {
    const { g, fila } = filaDeTeste()
    fila.enfileirar(evento('creatina'))
    expect(new Fila(g).quantos()).toBe(1)
  })

  it('esvazia mandando cada evento uma vez', async () => {
    const { fila } = filaDeTeste()
    fila.enfileirar(evento('creatina'))
    fila.enfileirar(evento('whey'))
    const enviados: string[] = []
    const r = await fila.esvaziar(async e => void enviados.push(String(e.dados.nome)))
    expect(enviados).toEqual(['creatina', 'whey'])
    expect(r).toMatchObject({ enviados: 2, descartados: 0, restam: 0 })
    expect(fila.quantos()).toBe(0)
  })

  it('guarda o item que falhou por rede e para de tentar os seguintes', async () => {
    const { fila } = filaDeTeste()
    fila.enfileirar(evento('creatina'))
    fila.enfileirar(evento('whey'))
    let tentativas = 0
    const r = await fila.esvaziar(async () => {
      tentativas++
      throw new ErroDeRede('sem sinal')
    })
    // Insistir sem sinal só gasta bateria, e a ordem importa quando dois
    // eventos tocam o mesmo dia.
    expect(tentativas).toBe(1)
    expect(r).toMatchObject({ enviados: 0, descartados: 0, restam: 2 })
    expect(fila.itens()[0].tentativas).toBe(1)
  })

  it('descarta o item recusado por erro de dado e segue com os outros', async () => {
    const { fila } = filaDeTeste()
    fila.enfileirar(evento('podre'))
    fila.enfileirar(evento('whey'))
    const enviados: string[] = []
    const r = await fila.esvaziar(async e => {
      if (e.dados.nome === 'podre') throw new ErroDeDado('tipo desconhecido')
      enviados.push(String(e.dados.nome))
    })
    // Um item que o banco nunca vai aceitar entupiria a fila para sempre, e
    // com ela todos os registros seguintes.
    expect(enviados).toEqual(['whey'])
    expect(r).toMatchObject({ enviados: 1, descartados: 1, restam: 0 })
    expect(r.avisos[0]).toContain('tipo desconhecido')
  })

  it('trata erro desconhecido como erro de rede', async () => {
    // Um TypeError de um fetch que nem saiu não pode apagar o registro.
    const { fila } = filaDeTeste()
    fila.enfileirar(evento('creatina'))
    const r = await fila.esvaziar(async () => { throw new TypeError('failed to fetch') })
    expect(r).toMatchObject({ enviados: 0, descartados: 0, restam: 1 })
  })

  it('recomeça vazia se o armazenamento estiver corrompido', () => {
    expect(filaDeTeste({ 'cortex.fila': 'isto não é json' }).fila.quantos()).toBe(0)
  })

  it('ignora item malformado guardado por uma versão antiga', () => {
    const guardado = JSON.stringify([
      { id: 'a', evento: { tipo: 'suplemento', dia: '2026-08-28', dados: {} }, criadoEm: 1, tentativas: 0 },
      { id: 'b', evento: { tipo: 'inventado', dia: 'ontem' } }
    ])
    expect(filaDeTeste({ 'cortex.fila': guardado }).fila.quantos()).toBe(1)
  })

  it('não passa de 500 itens, descartando os mais antigos', () => {
    const { fila } = filaDeTeste()
    for (let i = 0; i < 505; i++) fila.enfileirar(evento(`s${i}`))
    expect(fila.quantos()).toBe(500)
    expect(fila.itens()[0].evento.dados.nome).toBe('s5')
  })
})
