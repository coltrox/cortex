import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { ehIdDeVault, lerVaultId, gravarVaultId, idDoFragmento } from './ajustes'

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

describe('id vindo do QR', () => {
  it('le o id do fragmento', () => {
    expect(idDoFragmento(`#id=${ID}`)).toBe(ID)
  })

  it('funciona sem a cerquilha', () => {
    expect(idDoFragmento(`id=${ID}`)).toBe(ID)
  })

  it('normaliza caixa alta', () => {
    expect(idDoFragmento(`#id=${ID.toUpperCase()}`)).toBe(ID)
  })

  it('ignora fragmento sem id', () => {
    expect(idDoFragmento('')).toBe(null)
    expect(idDoFragmento('#')).toBe(null)
    expect(idDoFragmento('#outra=coisa')).toBe(null)
  })

  it('recusa id invalido no fragmento', () => {
    // Um link forjado nao aponta este celular para vault de terceiro sem
    // passar pela mesma validacao de sempre.
    expect(idDoFragmento('#id=nao-e-uuid')).toBe(null)
    expect(idDoFragmento('#id=<script>alert(1)</script>')).toBe(null)
  })

  it('convive com outros parametros no fragmento', () => {
    expect(idDoFragmento(`#foo=1&id=${ID}&bar=2`)).toBe(ID)
  })
})
