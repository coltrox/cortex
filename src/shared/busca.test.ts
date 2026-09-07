import { describe, it, expect } from 'vitest'
import { dobra, pontuar } from './busca'

describe('dobra', () => {
  it('tira acento e caixa', () => {
    // No celular se digita com pressa e sem acento; sem isto, procurar
    // "redacao" nao acha "Redação" e o campo parece quebrado.
    expect(dobra('Redação')).toBe('redacao')
    expect(dobra('PUC-Campinas')).toBe('puc-campinas')
    expect(dobra('Inglês')).toBe('ingles')
  })

  it('nao mexe no que nao tem acento', () => {
    expect(dobra('ENEM 1o dia')).toBe('enem 1o dia')
  })
})

describe('pontuar', () => {
  it('exato ganha de comeca-com, que ganha de contem', () => {
    expect(pontuar(['dentista'], 'dentista')).toBe(0)
    expect(pontuar(['dentista da tarde'], 'dentista')).toBe(1)
    expect(pontuar(['consulta dentista'], 'dentista')).toBe(2)
  })

  it('o primeiro campo vale mais que o segundo', () => {
    // Quem digita "dentista" quer a consulta chamada Dentista antes de uma
    // tarefa que so menciona dentista na observacao.
    const noNome = pontuar(['Dentista', 'nada'], 'dentista')
    const naObs = pontuar(['Consulta', 'levar o raio-x pro dentista'], 'dentista')
    expect(noNome).not.toBeNull()
    expect(naObs).not.toBeNull()
    expect(noNome as number).toBeLessThan(naObs as number)
  })

  it('qualquer acerto no campo 0 ganha do melhor acerto no campo 1', () => {
    // O passo de 3 existe para isto: o pior acerto no nome (contem, 2) ainda
    // tem que ganhar do melhor acerto no campo seguinte (exato, 3).
    expect(pontuar(['prova de dentista', 'x'], 'dentista')).toBe(2)
    expect(pontuar(['x', 'dentista'], 'dentista')).toBe(3)
  })

  it('acha sem acento o que foi escrito com acento', () => {
    expect(pontuar(['Redação de quarta'], 'redacao')).toBe(1)
  })

  it('campo vazio, nulo ou ausente nao quebra nem conta', () => {
    expect(pontuar([null, undefined, '', 'Unicamp'], 'unicamp')).toBe(9)
  })

  it('sem acerto, `null`', () => {
    expect(pontuar(['Unicamp', 'humanas'], 'fuvest')).toBeNull()
  })

  it('termo vazio nao acha tudo -- acha nada', () => {
    // Toda string contem a string vazia. Sem esta guarda, apagar a busca
    // deixaria a lista pontuada em vez de voltar ao normal.
    expect(pontuar(['Unicamp'], '')).toBeNull()
  })
})
