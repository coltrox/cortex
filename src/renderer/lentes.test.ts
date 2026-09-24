import { describe, it, expect } from 'vitest'
import { lentesVisiveis, lenteDeAbertura, soDeDev } from './lentes'

const LENTES = ['cerebro', 'hoje', 'conhecimento', 'saude', 'financas', 'vida', 'dev', 'calendario']
  .map(id => ({ id }))

const ids = (areas: string[]): string[] => lentesVisiveis(LENTES, areas).map(l => l.id)

describe('as lentes que aparecem na lateral', () => {
  it('so a area dev ligada: o Cortex vira um app de dev', () => {
    expect(soDeDev(['dev'])).toBe(true)
    expect(ids(['dev'])).toEqual(['cerebro', 'dev'])
  })

  it('dev com qualquer outra area traz o Hoje de volta', () => {
    expect(soDeDev(['dev', 'saude'])).toBe(false)
    expect(ids(['dev', 'saude'])).toEqual(['cerebro', 'hoje', 'saude', 'dev'])
  })

  it('sem area nenhuma ficam o cerebro e o Hoje', () => {
    expect(ids([])).toEqual(['cerebro', 'hoje'])
  })

  it('a area escolhida aparece, a desligada nao', () => {
    expect(ids(['conhecimento', 'calendario']))
      .toEqual(['cerebro', 'hoje', 'conhecimento', 'calendario'])
  })
})

describe('em qual lente abrir', () => {
  it('fica onde esta, se a lente continua existindo', () => {
    const v = lentesVisiveis(LENTES, ['dev', 'saude'])
    expect(lenteDeAbertura(v, 'saude', ['dev', 'saude'])?.id).toBe('saude')
  })

  it('no app so de dev, abre no Dev -- e nao na rede neural', () => {
    const v = lentesVisiveis(LENTES, ['dev'])
    expect(lenteDeAbertura(v, 'hoje', ['dev'])?.id).toBe('dev')
  })

  it('area desligada joga para a primeira lente', () => {
    const v = lentesVisiveis(LENTES, ['saude'])
    expect(lenteDeAbertura(v, 'financas', ['saude'])?.id).toBe('cerebro')
  })
})
