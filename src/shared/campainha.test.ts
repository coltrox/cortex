import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Campainha, type Toque } from './campainha'

const CRED = { url: 'https://exemplo.supabase.co', chave: 'chave-de-teste' }
const VAULT = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'
const TOPICO = `realtime:cortex:${VAULT}`

/** O dublê do socket: guarda o que foi enviado e deixa o teste mandar de volta. */
class SocketFalso {
  readyState = 0
  enviados: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((m: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  fechou = false

  constructor(readonly endereco: string) {}

  send(texto: string): void { this.enviados.push(JSON.parse(texto)) }
  close(): void { this.fechou = true; this.readyState = 3 }

  /* --- o que o teste dispara --- */
  conectar(): void { this.readyState = 1; this.onopen?.() }
  responder(payload: unknown, topico = TOPICO): void {
    this.onmessage?.({ data: JSON.stringify({ topic: topico, event: 'phx_reply', payload }) })
  }
  entrar(): void { this.conectar(); this.responder({ status: 'ok' }) }
  transmitir(evento: string, topico = TOPICO): void {
    this.onmessage?.({
      data: JSON.stringify({ topic: topico, event: 'broadcast', payload: { event: evento, payload: {} } })
    })
  }
  cair(): void { this.readyState = 3; this.onclose?.() }
}

function montar(): {
  campainha: Campainha
  sockets: SocketFalso[]
  tocados: Toque[]
} {
  const sockets: SocketFalso[] = []
  const tocados: Toque[] = []
  const campainha = new Campainha(CRED, VAULT, t => tocados.push(t), endereco => {
    const s = new SocketFalso(endereco)
    sockets.push(s)
    return s as unknown as WebSocket
  })
  return { campainha, sockets, tocados }
}

const enviadosDo = (s: SocketFalso, evento: string): Record<string, unknown>[] =>
  s.enviados.filter((e): e is Record<string, unknown> =>
    typeof e === 'object' && e !== null && (e as Record<string, unknown>).event === evento)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Campainha', () => {
  it('entra no canal do vault, e leva a chave no endereço', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()

    expect(sockets).toHaveLength(1)
    expect(sockets[0].endereco).toContain('wss://exemplo.supabase.co/realtime/v1/websocket')
    expect(sockets[0].endereco).toContain('apikey=chave-de-teste')

    sockets[0].conectar()
    const entrada = enviadosDo(sockets[0], 'phx_join')
    expect(entrada).toHaveLength(1)
    expect(entrada[0].topic).toBe(TOPICO)
  })

  it('não toca antes de estar dentro do canal', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()
    sockets[0].conectar()

    // Conectado, mas o canal ainda não confirmou.
    campainha.tocar('eventos')
    expect(enviadosDo(sockets[0], 'broadcast')).toHaveLength(0)
  })

  it('toca sem levar dado nenhum junto', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()
    sockets[0].entrar()
    campainha.tocar('eventos')

    const toques = enviadosDo(sockets[0], 'broadcast')
    expect(toques).toHaveLength(1)
    // O canal é público: quem soubesse o nome dele ouviria os toques. Esta
    // asserção é o que garante que ouvir não adianta nada — o toque diz que
    // mudou, e nunca o que mudou.
    expect(toques[0].payload).toEqual({ type: 'broadcast', event: 'eventos', payload: {} })
  })

  it('avisa quem ouve quando chega um toque', () => {
    const { campainha, sockets, tocados } = montar()
    campainha.abrir()
    sockets[0].entrar()

    sockets[0].transmitir('cardapio')
    expect(tocados).toEqual(['cardapio'])
  })

  it('ignora toque de outro tópico, nome desconhecido e lixo', () => {
    const { campainha, sockets, tocados } = montar()
    campainha.abrir()
    sockets[0].entrar()

    sockets[0].transmitir('cardapio', 'realtime:cortex:outro-vault')
    sockets[0].transmitir('apagar_tudo')
    sockets[0].onmessage?.({ data: 'isto nao e json' })

    expect(tocados).toEqual([])
  })

  it('religa sozinha depois de cair, esperando cada vez mais', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()
    sockets[0].entrar()

    sockets[0].cair()
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)

    // Cair de novo sem chegar a entrar no canal: a espera dobra, em vez de
    // ficar batendo no servidor de segundo em segundo.
    sockets[1].cair()
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(3)
  })

  it('volta a esperar pouco depois de uma conexão que deu certo', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()

    sockets[0].cair()
    vi.advanceTimersByTime(1000)
    sockets[1].cair()
    vi.advanceTimersByTime(2000)
    // A terceira entrou de verdade no canal.
    sockets[2].entrar()

    sockets[2].cair()
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(4)
  })

  it('fechar encerra de vez: não religa nem toca mais', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()
    sockets[0].entrar()

    campainha.fechar()
    expect(sockets[0].fechou).toBe(true)

    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(1)

    campainha.tocar('eventos')
    expect(enviadosDo(sockets[0], 'broadcast')).toHaveLength(0)

    campainha.abrir()
    expect(sockets).toHaveLength(1)
  })

  it('um socket velho caindo não agenda reconexão por cima do novo', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()
    sockets[0].cair()
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)

    // O `close` atrasado do primeiro chega agora, com o segundo já de pé.
    sockets[0].cair()
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(2)
  })

  it('sem WebSocket no ambiente, não quebra nada — só não toca', () => {
    const tocados: Toque[] = []
    const campainha = new Campainha(CRED, VAULT, t => tocados.push(t), () => null)

    expect(() => campainha.abrir()).not.toThrow()
    expect(() => campainha.tocar('eventos')).not.toThrow()
    expect(() => campainha.fechar()).not.toThrow()
  })

  it('bate o coração para a conexão não ser derrubada', () => {
    const { campainha, sockets } = montar()
    campainha.abrir()
    sockets[0].entrar()

    vi.advanceTimersByTime(25_000)
    const batidas = enviadosDo(sockets[0], 'heartbeat')
    expect(batidas).toHaveLength(1)
    expect(batidas[0].topic).toBe('phoenix')
  })
})
