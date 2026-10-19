import { describe, it, expect } from 'vitest'
import { aplicarOrdem, reordenar } from './ordemLentes'

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
