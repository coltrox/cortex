import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { ehIdDeVault, lerVaultId, gravarVaultId } from './ajustes'

const ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'

describe('guardadoDeMemoria', () => {
  it('devolve null para chave nunca gravada', () => {
    expect(guardadoDeMemoria().ler('nada')).toBe(null)
  })

  it('lê o que gravou e apaga', () => {
    const g = guardadoDeMemoria({ x: '1' })
    expect(g.ler('x')).toBe('1')
    g.gravar('a', 'valor')
    expect(g.ler('a')).toBe('valor')
    g.apagar('a')
    expect(g.ler('a')).toBe(null)
  })
})

describe('ehIdDeVault', () => {
  it('aceita um uuid', () => {
    expect(ehIdDeVault(ID)).toBe(true)
  })

  it('recusa texto qualquer e uuid truncado', () => {
    expect(ehIdDeVault('meu-vault')).toBe(false)
    expect(ehIdDeVault('')).toBe(false)
    expect(ehIdDeVault('3f2a1b4c-5d6e-4f70-8a91')).toBe(false)
  })
})

describe('vault id guardado', () => {
  it('devolve null quando nunca foi configurado', () => {
    expect(lerVaultId(guardadoDeMemoria())).toBe(null)
  })

  it('grava e lê', () => {
    const g = guardadoDeMemoria()
    gravarVaultId(g, ID)
    expect(lerVaultId(g)).toBe(ID)
  })

  it('normaliza espaço em volta e caixa alta', () => {
    const g = guardadoDeMemoria()
    gravarVaultId(g, `  ${ID.toUpperCase()}  `)
    expect(lerVaultId(g)).toBe(ID)
  })

  it('recusa gravar um id inválido', () => {
    const g = guardadoDeMemoria()
    expect(() => gravarVaultId(g, 'nao-e-uuid')).toThrow()
    expect(lerVaultId(g)).toBe(null)
  })

  it('trata como não configurado um valor corrompido no armazenamento', () => {
    // Devolver lixo faria toda chamada ao banco falhar em silêncio; com null o
    // app abre em Ajustes pedindo o id.
    expect(lerVaultId(guardadoDeMemoria({ 'cortex.vaultId': 'lixo' }))).toBe(null)
  })
})
