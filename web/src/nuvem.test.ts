import { describe, it, expect } from 'vitest'
import { ClienteWeb } from './nuvem'
import { ErroDeDado, ErroDeRede } from './erros'
import type { Evento } from '@compartilhado/eventos'

const CRED = { url: 'https://exemplo.supabase.co', chave: 'chave-publica' }
const VAULT = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'
const EVENTO: Evento = { tipo: 'suplemento', dia: '2026-08-28', dados: { nome: 'creatina' } }

/** Um fetch de mentira que registra a chamada e devolve o que o teste mandar. */
function buscarQueResponde(status: number, corpo: string) {
  const chamadas: { url: string; init: RequestInit }[] = []
  const buscar = async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} })
    return new Response(corpo, { status })
  }
  return { chamadas, buscar: buscar as unknown as typeof fetch }
}

const cliente = (buscar: typeof fetch, cred = CRED) => new ClienteWeb(cred, VAULT, 15_000, buscar)

describe('registrarEvento', () => {
  it('chama a função RPC com o formato que o banco espera', async () => {
    const { chamadas, buscar } = buscarQueResponde(200, '"e1"')
    await cliente(buscar).registrarEvento(EVENTO)
    expect(chamadas[0].url).toBe('https://exemplo.supabase.co/rest/v1/rpc/registrar_evento')
    expect(chamadas[0].init.method).toBe('POST')
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({
      p_vault: VAULT, p_dia: '2026-08-28', p_tipo: 'suplemento', p_dados: { nome: 'creatina' }
    })
  })

  it('manda a chave nos dois cabeçalhos que o Supabase exige', async () => {
    const { chamadas, buscar } = buscarQueResponde(200, '"e1"')
    await cliente(buscar).registrarEvento(EVENTO)
    const h = chamadas[0].init.headers as Record<string, string>
    expect(h.apikey).toBe('chave-publica')
    expect(h.authorization).toBe('Bearer chave-publica')
  })

  it('tolera barra sobrando no fim da url', async () => {
    const { chamadas, buscar } = buscarQueResponde(200, '"e1"')
    await cliente(buscar, { ...CRED, url: 'https://exemplo.supabase.co/' }).registrarEvento(EVENTO)
    expect(chamadas[0].url).toBe('https://exemplo.supabase.co/rest/v1/rpc/registrar_evento')
  })

  it('devolve o id que o banco gerou', async () => {
    const { buscar } = buscarQueResponde(200, '"5a6b7c"')
    expect(await cliente(buscar).registrarEvento(EVENTO)).toBe('5a6b7c')
  })

  it('erro 400 é erro de dado — não adianta repetir', async () => {
    const { buscar } = buscarQueResponde(400, '{"message":"tipo desconhecido"}')
    await expect(cliente(buscar).registrarEvento(EVENTO)).rejects.toBeInstanceOf(ErroDeDado)
  })

  it('erro 500 é erro de rede — tenta de novo depois', async () => {
    const { buscar } = buscarQueResponde(500, 'boom')
    await expect(cliente(buscar).registrarEvento(EVENTO)).rejects.toBeInstanceOf(ErroDeRede)
  })

  it('429 é erro de rede, apesar de ser 4xx', async () => {
    // Excesso de chamadas é justamente o caso em que esperar resolve.
    const { buscar } = buscarQueResponde(429, 'devagar')
    await expect(cliente(buscar).registrarEvento(EVENTO)).rejects.toBeInstanceOf(ErroDeRede)
  })

  it('falha de conexão é erro de rede', async () => {
    const buscar = (async () => { throw new TypeError('failed to fetch') }) as unknown as typeof fetch
    await expect(cliente(buscar).registrarEvento(EVENTO)).rejects.toBeInstanceOf(ErroDeRede)
  })

  it('resposta que não é JSON é erro de rede', async () => {
    // Um portal de wi-fi responde 200 com uma página de login.
    const { buscar } = buscarQueResponde(200, '<html>entre na rede</html>')
    await expect(cliente(buscar).registrarEvento(EVENTO)).rejects.toBeInstanceOf(ErroDeRede)
  })

  it('recusa um evento fora do contrato antes de chegar na rede', async () => {
    const { chamadas, buscar } = buscarQueResponde(200, '"e1"')
    const torto = { tipo: 'inventado', dia: '2026-08-28', dados: {} } as unknown as Evento
    await expect(cliente(buscar).registrarEvento(torto)).rejects.toBeInstanceOf(ErroDeDado)
    expect(chamadas).toHaveLength(0)
  })
})

describe('listarCardapio', () => {
  it('converte as linhas do banco em itens', async () => {
    const linhas = JSON.stringify([
      { vault_id: VAULT, especie: 'treino', nome: 'Peito', detalhe: { grupo: 'peito' } },
      { vault_id: VAULT, especie: 'suplemento', nome: 'Creatina', detalhe: { dose: '5 g' } }
    ])
    const { chamadas, buscar } = buscarQueResponde(200, linhas)
    const itens = await cliente(buscar).listarCardapio()
    expect(chamadas[0].url).toBe('https://exemplo.supabase.co/rest/v1/rpc/listar_cardapio')
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({ p_vault: VAULT })
    expect(itens).toEqual([
      { especie: 'treino', nome: 'Peito', detalhe: { grupo: 'peito' } },
      { especie: 'suplemento', nome: 'Creatina', detalhe: { dose: '5 g' } }
    ])
  })

  it('id de vault que não existe devolve lista vazia, não erro', async () => {
    // É o caso do id colado errado: a tela precisa poder avisar em vez de
    // mostrar telas em branco.
    const { buscar } = buscarQueResponde(200, '[]')
    expect(await cliente(buscar).listarCardapio()).toEqual([])
  })

  it('descarta linha com espécie desconhecida sem derrubar o resto', async () => {
    const linhas = JSON.stringify([
      { especie: 'treino', nome: 'Peito', detalhe: {} },
      { especie: 'foguete', nome: 'Saturno V', detalhe: {} }
    ])
    const { buscar } = buscarQueResponde(200, linhas)
    expect((await cliente(buscar).listarCardapio()).map(i => i.nome)).toEqual(['Peito'])
  })

  it('resposta que não é lista é erro de rede', async () => {
    const { buscar } = buscarQueResponde(200, '{"erro":"opa"}')
    await expect(cliente(buscar).listarCardapio()).rejects.toBeInstanceOf(ErroDeRede)
  })
})
