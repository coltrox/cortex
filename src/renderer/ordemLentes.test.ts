import { describe, it, expect } from 'vitest'
import { aplicarOrdem, reordenar, soltarPerto } from './ordemLentes'

const lentes = [
  { id: 'cerebro' }, { id: 'hoje' }, { id: 'conhecimento' },
  { id: 'saude' }, { id: 'financas' }
]

describe('aplicarOrdem', () => {
  it('respeita a ordem escolhida', () => {
    const ordem = ['conhecimento', 'hoje', 'saude', 'financas', 'cerebro']
    expect(aplicarOrdem(lentes, ordem).map(l => l.id)).toEqual(ordem)
  })

  it('sem ordem guardada, mantem a ordem original', () => {
    expect(aplicarOrdem(lentes, []).map(l => l.id))
      .toEqual(['cerebro', 'hoje', 'conhecimento', 'saude', 'financas'])
  })

  it('area que a ordem nao conhece entra no fim, e NAO some', () => {
    // O caso de atualizar o app: a ordem foi gravada antes de a área existir.
    const r = aplicarOrdem(lentes, ['saude', 'hoje']).map(l => l.id)
    expect(r.slice(0, 2)).toEqual(['saude', 'hoje'])
    expect(r).toHaveLength(5)
    expect(new Set(r).size).toBe(5)
  })

  it('id que nao existe mais na ordem e ignorado', () => {
    const r = aplicarOrdem(lentes, ['area-que-sumiu', 'hoje', 'cerebro']).map(l => l.id)
    expect(r.slice(0, 2)).toEqual(['hoje', 'cerebro'])
    expect(r).toHaveLength(5)
  })

  it('nao duplica nem perde area nenhuma', () => {
    const r = aplicarOrdem(lentes, ['financas', 'financas', 'hoje'])
    expect(r).toHaveLength(5)
    expect(new Set(r.map(l => l.id)).size).toBe(5)
  })
})

describe('reordenar', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('leva para cima', () => {
    expect(reordenar(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leva para baixo', () => {
    expect(reordenar(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('soltar em cima de si mesmo nao muda nada', () => {
    expect(reordenar(ids, 'b', 'b')).toBe(ids)
  })

  it('id desconhecido nao mexe na lista', () => {
    expect(reordenar(ids, 'x', 'b')).toBe(ids)
    expect(reordenar(ids, 'a', 'x')).toBe(ids)
  })
})

describe('soltarPerto', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('solta acima do alvo', () => {
    expect(soltarPerto(ids, 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('solta abaixo do alvo', () => {
    expect(soltarPerto(ids, 'd', 'b', true)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('subindo de baixo, nao escorrega uma posicao', () => {
    // O erro classico: procurar o indice do alvo na lista COM o arrastado
    // ainda nela faz o item parar um lugar depois do prometido.
    expect(soltarPerto(ids, 'a', 'c', false)).toEqual(['b', 'a', 'c', 'd'])
    expect(soltarPerto(ids, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('da para alcancar o fim da lista', () => {
    // O lugar que `reordenar` nao alcanca: depois do ultimo.
    expect(soltarPerto(ids, 'a', 'd', true)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('da para alcancar o comeco', () => {
    expect(soltarPerto(ids, 'c', 'a', false)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('soltar onde ja esta nao muda a lista', () => {
    expect(soltarPerto(ids, 'b', 'b', false)).toBe(ids)
    expect(soltarPerto(ids, 'b', 'a', true)).toBe(ids)
    expect(soltarPerto(ids, 'b', 'c', false)).toBe(ids)
  })

  it('id desconhecido nao mexe em nada', () => {
    expect(soltarPerto(ids, 'x', 'b', false)).toBe(ids)
    expect(soltarPerto(ids, 'a', 'x', true)).toBe(ids)
  })

  it('nao duplica nem perde item', () => {
    for (const depois of [true, false]) {
      for (const de of ids) {
        for (const alvo of ids) {
          const r = soltarPerto(ids, de, alvo, depois)
          expect(r).toHaveLength(4)
          expect(new Set(r).size).toBe(4)
        }
      }
    }
  })
})

describe('aplicarOrdem nas abas de uma area', () => {
  // As abas usam a mesma funcao das areas: e o mesmo problema, um nivel
  // abaixo. O teste existe para garantir que continuem usando.
  const abas = [
    { id: 'overview' }, { id: 'cronograma' }, { id: 'conteudos' },
    { id: 'provas' }, { id: 'simulados' }
  ]

  it('da para subir simulados para o topo', () => {
    const r = aplicarOrdem(abas, ['simulados', 'cronograma'])
    expect(r.map(a => a.id)).toEqual(['simulados', 'cronograma', 'overview', 'conteudos', 'provas'])
  })

  it('aba nova de uma versao posterior nao some', () => {
    const r = aplicarOrdem(abas, ['provas', 'overview'])
    expect(r).toHaveLength(5)
    expect(new Set(r.map(a => a.id)).size).toBe(5)
  })
})
