import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lerConfig, gravarConfig, normalizarConfig, novoVaultId, IDS_AREAS } from './config'

let dir: string, arq: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cortex-cfg-'))
  arq = join(dir, 'config.json')
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('normalizarConfig', () => {
  it('descarta area inventada', () => {
    const c = normalizarConfig({ areas: ['vida', 'nao-existe', 'saude'], pastasDev: [] })
    expect(c.areas).toEqual(['vida', 'saude'])
  })

  it('aceita lista de areas vazia — o usuario pode desligar tudo', () => {
    expect(normalizarConfig({ areas: [], pastasDev: [] }).areas).toEqual([])
  })

  it('cai no padrao quando areas nao e lista', () => {
    expect(normalizarConfig({ areas: 'vida' }).areas).toEqual(IDS_AREAS)
  })

  it('tira pasta repetida e valor que nao e string', () => {
    const c = normalizarConfig({ pastasDev: ['/a', '/a', 42, '', '/b'] })
    expect(c.pastasDev).toEqual(['/a', '/b'])
  })
})

describe('lerConfig', () => {
  it('devolve o padrao quando o arquivo nao existe', async () => {
    // Não usa toEqual(CONFIG_PADRAO): lerConfig passa pelo catch por
    // normalizarConfig({}), que gera um vaultId — CONFIG_PADRAO.vaultId é ''.
    expect(await lerConfig(arq)).toMatchObject({ areas: IDS_AREAS, pastasDev: [], escolheu: false })
  })

  it('devolve o padrao quando o JSON esta truncado, sem lancar', async () => {
    // Queda de energia no meio da gravacao nao pode impedir o vault de abrir.
    await writeFile(arq, '{ "areas": ["vida"', 'utf8')
    expect(await lerConfig(arq)).toMatchObject({ areas: IDS_AREAS, pastasDev: [], escolheu: false })
  })

  it('le de volta o que gravou', async () => {
    await gravarConfig(arq, { areas: ['dev'], pastasDev: ['/x'], escolheu: true, vaultId: novoVaultId(), nuvem: null })
    expect(await lerConfig(arq)).toEqual({
      areas: ['dev'], pastasDev: ['/x'], escolheu: true, vaultId: expect.any(String), nuvem: null
    })
  })

  it('grava JSON legivel por humano', async () => {
    await gravarConfig(arq, { areas: ['dev'], pastasDev: [], escolheu: true, vaultId: novoVaultId(), nuvem: null })
    expect(await readFile(arq, 'utf8')).toContain('\n  "areas"')
  })

  it('vault sem config.json nasce com vaultId', async () => {
    const c = await lerConfig(join(dir, 'nao-existe.json'))
    expect(c.vaultId).toMatch(/^[0-9a-f]{8}-/)
  })
})

describe('vaultId', () => {
  it('gera um UUID valido', () => {
    expect(novoVaultId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('dois vaults nunca recebem o mesmo id', () => {
    expect(novoVaultId()).not.toBe(novoVaultId())
  })

  it('config sem vaultId ganha um ao normalizar', () => {
    const c = normalizarConfig({ areas: [], pastasDev: [] })
    expect(c.vaultId).toMatch(/^[0-9a-f]{8}-/)
  })

  it('preserva o vaultId que ja existe — trocar sozinho orfanaria o celular', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(normalizarConfig({ vaultId: id }).vaultId).toBe(id)
  })

  it('descarta vaultId que nao e UUID', () => {
    const c = normalizarConfig({ vaultId: 'sou-um-id-inventado' })
    expect(c.vaultId).not.toBe('sou-um-id-inventado')
    expect(c.vaultId).toMatch(/^[0-9a-f]{8}-/)
  })

  it('nuvem comeca vazia e aceita url e chave', () => {
    expect(normalizarConfig({}).nuvem).toBeNull()
    const c = normalizarConfig({ nuvem: { url: 'https://x.supabase.co', chave: 'k' } })
    expect(c.nuvem).toEqual({ url: 'https://x.supabase.co', chave: 'k' })
  })

  it('descarta nuvem sem url ou sem chave', () => {
    expect(normalizarConfig({ nuvem: { url: 'https://x' } }).nuvem).toBeNull()
  })
})
