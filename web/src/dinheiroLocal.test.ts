import { describe, it, expect } from 'vitest'
import type { Guardado } from './guardado'
import type { Transacao } from './cardapio'
import { guardarGasto, comGastosLocais, ehLocal, guardarMovimento, saldoComMovimentos } from './dinheiroLocal'

function memoria(): Guardado {
  const m = new Map<string, string>()
  return { ler: k => m.get(k) ?? null, gravar: (k, v) => { m.set(k, v) }, apagar: k => { m.delete(k) } }
}

const AGORA = Date.parse('2026-09-17T12:00:00Z')
const almoco = { data: '2026-09-17', item: 'Almoço', valor: 32.5, cat: 'alimentação', entrada: false }
const publicada = (chave: string, t = almoco): Transacao => ({ chave, ...t })

describe('gastos lançados aqui', () => {
  it('aparecem na hora, sem ação de editar, e somem quando o Cortex devolve', () => {
    const g = memoria()
    guardarGasto(g, [], almoco, AGORA)
    const antes = comGastosLocais(g, [], AGORA)
    expect(antes).toHaveLength(1)
    expect(ehLocal(antes[0])).toBe(true)

    const depois = comGastosLocais(g, [publicada('2026-09-17#transacoes#0')], AGORA + 1000)
    expect(depois).toHaveLength(1)
    expect(ehLocal(depois[0])).toBe(false)
    // A faxina ficou no disco: sem publicado, não volta.
    expect(comGastosLocais(g, [], AGORA + 2000)).toHaveLength(0)
  })

  it('dois almoços iguais no mesmo dia: o segundo espera o próprio lugar', () => {
    const g = memoria()
    const jaTinha = [publicada('2026-09-17#transacoes#0')]
    guardarGasto(g, jaTinha, almoco, AGORA)
    guardarGasto(g, jaTinha, almoco, AGORA + 1)
    expect(comGastosLocais(g, jaTinha, AGORA + 2).filter(ehLocal)).toHaveLength(2)
    const chegouUm = [...jaTinha, publicada('2026-09-17#transacoes#1')]
    expect(comGastosLocais(g, chegouUm, AGORA + 3).filter(ehLocal)).toHaveLength(1)
  })

  it('o que não voltou em dois dias deixa de aparecer', () => {
    const g = memoria()
    guardarGasto(g, [], almoco, AGORA)
    expect(comGastosLocais(g, [], AGORA + 3 * 24 * 3600 * 1000)).toHaveLength(0)
  })
})

describe('porquinho lançado aqui', () => {
  it('o saldo muda na hora e não conta duas vezes quando o Cortex devolve', () => {
    const g = memoria()
    guardarMovimento(g, 100, 50, AGORA)
    guardarMovimento(g, 100, -20, AGORA + 1)
    expect(saldoComMovimentos(g, 100, AGORA + 2)).toBe(130)
    // Chegou só o primeiro.
    expect(saldoComMovimentos(g, 150, AGORA + 3)).toBe(130)
    // Chegaram os dois.
    expect(saldoComMovimentos(g, 130, AGORA + 4)).toBe(130)
    expect(saldoComMovimentos(g, 130, AGORA + 5)).toBe(130)
  })
})
