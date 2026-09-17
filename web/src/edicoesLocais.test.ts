import { describe, it, expect } from 'vitest'
import type { Guardado } from './guardado'
import type { Cardapio } from './cardapio'
import { guardarEdicao, aplicarEdicoes } from './edicoesLocais'

function memoria(): Guardado {
  const m = new Map<string, string>()
  return { ler: k => m.get(k) ?? null, gravar: (k, v) => { m.set(k, v) }, apagar: k => { m.delete(k) } }
}

const HOJE = '2026-09-17'
const AGORA = Date.parse('2026-09-17T12:00:00Z')

const cardapio = (itens: Cardapio['itens']): Cardapio => ({ itens, atualizadoEm: null })
const dentista = { especie: 'compromisso', nome: 'Dentista', detalhe: { path: 'Agenda/Dentista.md', data: '2026-09-20', hora: '10:00' } } as const
const mae = {
  especie: 'compromisso', nome: 'Aniversário da mãe',
  detalhe: { path: 'Agenda/Mãe.md', data: '2027-05-12', comemorativa: true, dia: 12, mes: 5, ano: 1975, anos: 52 }
} as const
const nota = { especie: 'anotacao', nome: 'Comprar pão', detalhe: { path: 'Vida/Comprar pão.md', texto: 'Comprar pão' } } as const

describe('edições feitas no celular', () => {
  it('aparecem na hora e somem quando o Cortex devolve o item mudado', () => {
    const g = memoria()
    const antes = cardapio([dentista])
    guardarEdicao(g, antes, { path: 'Agenda/Dentista.md', titulo: 'Dentista (remarcado)', data: '2026-09-22', hora: '14:00' }, AGORA)
    const visto = aplicarEdicoes(g, antes, HOJE, AGORA)
    expect(visto.itens[0].nome).toBe('Dentista (remarcado)')
    expect(visto.itens[0].detalhe).toMatchObject({ data: '2026-09-22', hora: '14:00' })

    const devolvido = cardapio([{ ...dentista, nome: 'Dentista (remarcado)', detalhe: { ...dentista.detalhe, data: '2026-09-22', hora: '14:00' } }])
    expect(aplicarEdicoes(g, devolvido, HOJE, AGORA + 1)).toEqual(devolvido)
    // Saiu do disco: o item antigo publicado de novo não é "corrigido" por uma edição velha.
    expect(aplicarEdicoes(g, antes, HOJE, AGORA + 2)).toEqual(antes)
  })

  it('data comemorativa recalcula a próxima data e os anos', () => {
    const g = memoria()
    const c = cardapio([mae])
    guardarEdicao(g, c, { path: 'Agenda/Mãe.md', comemorativa: true, data: '2026-10-03', ano: 1980, oque: 'aniversário', quem: 'Mãe' }, AGORA)
    const d = aplicarEdicoes(g, c, HOJE, AGORA).itens[0].detalhe
    expect(d).toMatchObject({ dia: 3, mes: 10, data: '2026-10-03', ano: 1980, anos: 46, oque: 'aniversário', quem: 'Mãe' })
  })

  it('anotação mostra o texto novo; edição que não voltou em dois dias sai', () => {
    const g = memoria()
    const c = cardapio([nota])
    guardarEdicao(g, c, { path: 'Vida/Comprar pão.md', titulo: 'Comprar pão e leite', texto: 'Comprar pão e leite' }, AGORA)
    expect(aplicarEdicoes(g, c, HOJE, AGORA).itens[0]).toMatchObject({ nome: 'Comprar pão e leite', detalhe: { texto: 'Comprar pão e leite' } })
    expect(aplicarEdicoes(g, c, HOJE, AGORA + 3 * 24 * 3600 * 1000)).toEqual(c)
  })
})
