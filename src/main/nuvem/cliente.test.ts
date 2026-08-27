import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { ClienteNuvem } from './cliente'

let servidor: Server
let url: string
let recebido: { caminho: string; corpo: unknown; cabecalhos: Record<string, unknown> }[] = []
let responder: () => { status: number; corpo?: unknown; textoBruto?: string } =
  () => ({ status: 200, corpo: [] })
// Quando true, o servidor aceita a conexão e nunca responde — simula rede
// degradada / conexão pendurada para testar o timeout sem mockar fetch.
let travar = false

beforeEach(async () => {
  recebido = []
  travar = false
  servidor = createServer((req, res) => {
    let bruto = ''
    req.on('data', c => { bruto += c })
    req.on('end', () => {
      recebido.push({
        caminho: req.url ?? '',
        corpo: bruto ? JSON.parse(bruto) : null,
        cabecalhos: req.headers as Record<string, unknown>
      })
      if (travar) return
      const r = responder()
      res.writeHead(r.status, { 'content-type': 'application/json' })
      res.end(r.textoBruto ?? JSON.stringify(r.corpo))
    })
  })
  await new Promise<void>(ok => { servidor.listen(0, '127.0.0.1', ok) })
  const info = servidor.address() as { port: number }
  url = `http://127.0.0.1:${info.port}`
})
afterEach(async () => { await new Promise<void>(ok => { servidor.close(() => ok()) }) })

const cliente = (timeoutMs?: number): ClienteNuvem =>
  new ClienteNuvem({ url, chave: 'chave-de-teste' }, '11111111-1111-4111-8111-111111111111', timeoutMs)

describe('ClienteNuvem', () => {
  it('chama a funcao rpc certa e manda a chave nos cabecalhos', async () => {
    responder = () => ({ status: 200, corpo: [] })
    await cliente().listarEventos('2026-08-01T00:00:00Z')
    expect(recebido[0].caminho).toBe('/rest/v1/rpc/listar_eventos')
    expect(recebido[0].cabecalhos.apikey).toBe('chave-de-teste')
    expect(recebido[0].corpo).toEqual({
      p_vault: '11111111-1111-4111-8111-111111111111', p_desde: '2026-08-01T00:00:00Z'
    })
  })

  it('converte a resposta do banco para o formato do app', async () => {
    responder = () => ({
      status: 200,
      corpo: [{ id: 'e1', criado_em: '2026-08-27T10:00:00Z', dia: '2026-08-27',
                tipo: 'suplemento', dados: { nome: 'Whey' } }]
    })
    const [e] = await cliente().listarEventos('2026-08-01T00:00:00Z')
    expect(e).toEqual({
      id: 'e1', criadoEm: '2026-08-27T10:00:00Z', dia: '2026-08-27',
      tipo: 'suplemento', dados: { nome: 'Whey' }
    })
  })

  it('descarta evento invalido sem derrubar o resto', async () => {
    responder = () => ({
      status: 200,
      corpo: [
        { id: 'ruim', criado_em: 'x', dia: 'nao-e-data', tipo: 'suplemento', dados: {} },
        { id: 'bom', criado_em: 'x', dia: '2026-08-27', tipo: 'peso', dados: { peso: 78 } }
      ]
    })
    const es = await cliente().listarEventos('2026-08-01T00:00:00Z')
    expect(es.map(e => e.id)).toEqual(['bom'])
  })

  it('erro HTTP vira excecao com o texto do servidor', async () => {
    responder = () => ({ status: 401, corpo: { message: 'chave invalida' } })
    await expect(cliente().listarEventos('2026-08-01T00:00:00Z'))
      .rejects.toThrow(/401/)
  })

  it('publica o cardapio como uma chamada so', async () => {
    responder = () => ({ status: 200, corpo: 3 })
    const n = await cliente().publicarCardapio([
      { especie: 'treino', nome: 'Push A', detalhe: { grupo: 'push' } }
    ])
    expect(recebido[0].caminho).toBe('/rest/v1/rpc/publicar_cardapio')
    expect(recebido[0].corpo).toEqual({
      p_vault: '11111111-1111-4111-8111-111111111111',
      p_itens: [{ especie: 'treino', nome: 'Push A', detalhe: { grupo: 'push' } }]
    })
    expect(n).toBe(3)
  })

  it('sem resposta do servidor, rejeita por tempo esgotado sem travar o teste', async () => {
    travar = true
    await expect(cliente(50).listarEventos('2026-08-01T00:00:00Z'))
      .rejects.toThrow(/tempo esgotado/)
  })

  it('listar_eventos com corpo que nao e array falha alto, nao vira lista vazia', async () => {
    responder = () => ({ status: 200, corpo: { erro: 'nao autorizado' } })
    await expect(cliente().listarEventos('2026-08-01T00:00:00Z'))
      .rejects.toThrow(/inesperado/)
  })

  it('publicar_cardapio com corpo que nao e numero falha alto, nao finge sucesso', async () => {
    responder = () => ({ status: 200, corpo: { ok: true } })
    await expect(cliente().publicarCardapio([]))
      .rejects.toThrow(/inesperado/)
  })

  it('corpo que nao e JSON (html de proxy) vira mensagem clara, nao SyntaxError cru', async () => {
    responder = () => ({ status: 200, textoBruto: '<html>erro de proxy</html>' })
    await expect(cliente().listarEventos('2026-08-01T00:00:00Z'))
      .rejects.toThrow(/não é JSON/)
  })
})
