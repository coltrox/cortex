import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  lerConfig, gravarConfig, normalizarConfig, novoVaultId, IDS_AREAS, projetarConfigParaRenderer
, ENDERECO_APP_PADRAO } from './config'

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
    await gravarConfig(arq, { areas: ['dev'], pastasDev: ['/x'], escolheu: true, vaultId: novoVaultId(), nuvem: null, senha: null, paineisTrancados: [], enderecoApp: ENDERECO_APP_PADRAO, cofre: null })
    expect(await lerConfig(arq)).toEqual({
      areas: ['dev'], pastasDev: ['/x'], escolheu: true, vaultId: expect.any(String), nuvem: null, senha: null, paineisTrancados: [], enderecoApp: ENDERECO_APP_PADRAO, cofre: null
    })
  })

  it('grava JSON legivel por humano', async () => {
    await gravarConfig(arq, { areas: ['dev'], pastasDev: [], escolheu: true, vaultId: novoVaultId(), nuvem: null, senha: null, paineisTrancados: [], enderecoApp: ENDERECO_APP_PADRAO, cofre: null })
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

describe('projetarConfigParaRenderer', () => {
  // `vault:state`, `vault:pick`, `vault:create`, o evento `vault:aberto` e
  // `config:get` mandam este recorte para o renderer — nunca `session.config`
  // inteiro. O teste serializa como o IPC do Electron faria (JSON) e falha
  // se a chave da nuvem, mesmo fictícia, aparecer em qualquer parte do
  // payload: é essa string na rede/no devtools que não pode existir.
  const chaveFicticia = 'chave-secreta-jamais-deve-vazar'
  // O segredo da senha entra no teste com a marca do formato real; sem ela
  // `normalizarConfig` o descartaria, e o teste passaria por não haver nada
  // para vazar — que é o modo silencioso deste tipo de teste morrer.
  const segredoFicticio = 'scrypt$16384$5a1b2c3d$hash-da-senha-jamais-deve-vazar'
  const configCompleta = normalizarConfig({
    areas: ['saude'],
    pastasDev: ['/projetos/x'],
    escolheu: true,
    vaultId: novoVaultId(),
    nuvem: { url: 'https://x.supabase.co', chave: chaveFicticia },
    senha: segredoFicticio,
    paineisTrancados: ['vida', 'financas']
  })

  it('nao inclui vaultId, nuvem nem o segredo da senha no objeto', () => {
    const p = projetarConfigParaRenderer(configCompleta)
    // toEqual com a forma inteira, e não uma lista de chaves proibidas: um
    // campo novo acrescentado sem pensar quebra este teste, que é o ponto.
    expect(p).toEqual({
      areas: ['saude'],
      pastasDev: ['/projetos/x'],
      escolheu: true,
      paineisTrancados: ['vida', 'financas'],
      temSenha: true
    })
    expect(Object.keys(p)).not.toContain('vaultId')
    expect(Object.keys(p)).not.toContain('nuvem')
    expect(Object.keys(p)).not.toContain('senha')
  })

  it('a projecao confirma que existe senha sem entregar o segredo', () => {
    expect(projetarConfigParaRenderer(configCompleta).temSenha).toBe(true)
    expect(projetarConfigParaRenderer(normalizarConfig({})).temSenha).toBe(false)
  })

  it('sem senha cadastrada, nenhum painel fica trancado', () => {
    // Um painel trancado sem senha seria um painel que ninguem abre, nem o
    // dono -- e a unica saida seria editar o config.json a mao.
    const c = normalizarConfig({ paineisTrancados: ['vida', 'financas'] })
    expect(c.paineisTrancados).toEqual([])
  })

  it('a chave da nuvem nao aparece na serializacao JSON do payload', () => {
    const serializado = JSON.stringify(projetarConfigParaRenderer(configCompleta))
    expect(serializado).not.toContain(chaveFicticia)
    expect(serializado).not.toContain('nuvem')
    expect(serializado).not.toContain(configCompleta.vaultId)
    // O hash da senha tambem nao: ele e material para ataque de dicionario
    // offline, e o renderer nao tem uso nenhum para ele.
    expect(serializado).not.toContain(segredoFicticio)
    expect(serializado).not.toContain('scrypt')
  })
})

describe('endereco do app do celular', () => {
  it('ja vem preenchido, para o QR nascer como link', () => {
    // Sem endereco o QR carrega o id cru: a camera mostra o texto e a pessoa
    // copia a mao, em vez de o app abrir ja conectado.
    expect(normalizarConfig({}).enderecoApp).toBe(ENDERECO_APP_PADRAO)
  })

  it('aceita outro https', () => {
    expect(normalizarConfig({ enderecoApp: 'https://outro.vercel.app' }).enderecoApp)
      .toBe('https://outro.vercel.app')
  })

  it('tira a barra do fim, para o QR nao virar // no meio do link', () => {
    expect(normalizarConfig({ enderecoApp: 'https://outro.vercel.app/' }).enderecoApp)
      .toBe('https://outro.vercel.app')
  })

  it('em branco volta ao padrao em vez de esvaziar', () => {
    expect(normalizarConfig({ enderecoApp: '' }).enderecoApp).toBe(ENDERECO_APP_PADRAO)
  })

  it('o que nao for https volta ao padrao', () => {
    // O conteudo deste campo vira um QR que alguem aponta a camera e abre.
    for (const ruim of [
      'http://cortex.vercel.app',
      'javascript:alert(1)',
      'file:///C:/Windows',
      'nao e url nenhuma',
      'data:text/html,<script>x</script>'
    ]) {
      expect(normalizarConfig({ enderecoApp: ruim }).enderecoApp).toBe(ENDERECO_APP_PADRAO)
    }
  })

  it('valor que nao e texto volta ao padrao', () => {
    expect(normalizarConfig({ enderecoApp: 42 }).enderecoApp).toBe(ENDERECO_APP_PADRAO)
    expect(normalizarConfig({ enderecoApp: ['https://x.com'] }).enderecoApp)
      .toBe(ENDERECO_APP_PADRAO)
  })

  it('o endereco nao entra na projecao para o renderer', () => {
    // Ele sai por `nuvem:estado`, que ja e um recorte proprio -- a projecao
    // continua sendo a lista branca minima.
    const c = normalizarConfig({ enderecoApp: 'https://outro.vercel.app' })
    expect(Object.keys(projetarConfigParaRenderer(c))).not.toContain('enderecoApp')
  })
})
