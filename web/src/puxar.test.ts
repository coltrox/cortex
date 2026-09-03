import { describe, it, expect } from 'vitest'
import { comResistencia, passou, progresso, LIMITE, MAXIMO } from './puxar'

describe('a borracha do gesto', () => {
  it('anda metade do que o dedo anda', () => {
    expect(comResistencia(100)).toBe(50)
  })

  it('para no teto por mais que se puxe', () => {
    // Sem teto o indicador desce a tela inteira e some do campo de visão --
    // o gesto perderia justamente o retorno visual que ele existe para dar.
    expect(comResistencia(10_000)).toBe(MAXIMO)
  })

  it('puxar para cima não é puxar', () => {
    expect(comResistencia(-50)).toBe(0)
    expect(comResistencia(0)).toBe(0)
  })
})

describe('o ponto de soltar', () => {
  it('antes do limite não dispara', () => {
    expect(passou(LIMITE - 1)).toBe(false)
  })

  it('no limite, dispara', () => {
    expect(passou(LIMITE)).toBe(true)
  })
})

describe('o quanto o indicador aparece', () => {
  it('nasce em zero e chega inteiro no limite', () => {
    expect(progresso(0)).toBe(0)
    expect(progresso(LIMITE)).toBe(1)
    expect(progresso(LIMITE / 2)).toBeCloseTo(0.5)
  })

  it('não passa de um nem cai abaixo de zero', () => {
    // O indicador é opacidade e rotação: acima de 1 ficaria "mais que
    // opaco", que não quer dizer nada, e abaixo de 0 sumiria de um jeito
    // diferente de estar ausente.
    expect(progresso(MAXIMO)).toBe(1)
    expect(progresso(-30)).toBe(0)
  })
})
