/**
 * A campainha: um toque de "mudou alguma coisa", nos dois sentidos.
 *
 * O celular grava um evento e toca; o Cortex ouve e puxa na hora. O Cortex
 * publica e toca; o celular ouve e busca na hora. Sem isso, os dois lados
 * ficam esperando o relógio de dois minutos.
 *
 * ## É campainha, não caixa de correio
 *
 * O toque NÃO leva dado nenhum — só o lado que mexeu. Quem ouve vai buscar
 * pelas mesmas funções de sempre, que exigem o id do vault. O canal é público
 * (a chave anon entra em qualquer canal), então quem soubesse o nome dele
 * ouviria os toques; e ouvir um toque vazio não diz nada sobre a vida de
 * ninguém. O nome do canal é o próprio id do vault — o mesmo segredo que já
 * guarda todo o resto.
 *
 * ## É melhoria, nunca dependência
 *
 * Se o WebSocket não abrir — rede que bloqueia, Realtime fora do ar,
 * `WebSocket` que não existe no ambiente — nada quebra: os dois lados
 * continuam com o relógio que já tinham. É por isso que o protocolo do
 * Supabase Realtime cabe aqui à mão, em vez de trazer o SDK inteiro para
 * dentro de um app de celular: a superfície usada é minúscula (entrar no
 * canal, bater o coração, mandar e ouvir um toque) e a falha dela é sempre
 * "continua como antes".
 */

export type Toque = 'eventos' | 'cardapio'

/** Nomes que a campainha aceita ouvir. Qualquer outro é descartado. */
const TOQUES: readonly Toque[] = ['eventos', 'cardapio']

/** O Realtime derruba a conexão sem batida de coração. Ele usa 30 s. */
const BATIDA_MS = 25_000

const ESPERA_MIN_MS = 1_000
const ESPERA_MAX_MS = 30_000

export type CredencialCampainha = { url: string; chave: string }

/**
 * O socket do ambiente, ou `null` onde não existe WebSocket.
 *
 * Separado para o teste poder passar um dublê — mesmo arranjo de `ClienteWeb`,
 * que recebe o `fetch`. Sem isso, testar a campainha exigiria um servidor.
 */
export type AbrirSocket = (endereco: string) => WebSocket | null

const socketDoAmbiente: AbrirSocket = endereco =>
  typeof WebSocket === 'undefined' ? null : new WebSocket(endereco)

export class Campainha {
  private ws: WebSocket | null = null
  private batida: ReturnType<typeof setInterval> | null = null
  private religar: ReturnType<typeof setTimeout> | null = null
  private espera = ESPERA_MIN_MS
  private ref = 0
  private dentro = false
  /** `fechar()` foi chamado: para de tentar religar para sempre. */
  private morta = false

  constructor(
    private readonly cred: CredencialCampainha,
    private readonly vaultId: string,
    private readonly aoTocar: (t: Toque) => void,
    private readonly abrirSocket: AbrirSocket = socketDoAmbiente
  ) {}

  private get topico(): string {
    return `realtime:cortex:${this.vaultId}`
  }

  private endereco(): string {
    // O endereço REST e o do WebSocket são o mesmo host; só muda o esquema e o
    // caminho. Derivar daqui evita uma segunda variável de ambiente para
    // manter em dia.
    const host = new URL(this.cred.url).host
    return `wss://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(this.cred.chave)}&vsn=1.0.0`
  }

  private enviar(topico: string, evento: string, dados: unknown): void {
    if (!this.ws || this.ws.readyState !== 1) return
    this.ws.send(JSON.stringify({ topic: topico, event: evento, payload: dados, ref: String(++this.ref) }))
  }

  abrir(): void {
    if (this.morta || this.ws) return

    let ws: WebSocket | null
    try {
      ws = this.abrirSocket(this.endereco())
    } catch {
      // URL torta na configuração. Tentar de novo em laço apertado não
      // conserta isso, então a campainha simplesmente não toca.
      this.morta = true
      return
    }
    // Ambiente sem WebSocket: fica só o relógio, e é uma degradação silenciosa
    // de propósito — nada deixou de funcionar.
    if (!ws) return
    this.ws = ws

    ws.onopen = (): void => {
      this.dentro = false
      this.enviar(this.topico, 'phx_join', {
        // `self: false` para não ouvir o próprio toque: quem acabou de gravar
        // já sabe o que gravou, e buscar de novo por causa disso seria uma
        // ida ao banco à toa.
        config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: false },
        access_token: this.cred.chave
      })
      this.batida = setInterval(() => this.enviar('phoenix', 'heartbeat', {}), BATIDA_MS)
    }

    ws.onmessage = (m: MessageEvent): void => {
      let d: { topic?: unknown; event?: unknown; payload?: unknown }
      try {
        d = JSON.parse(String(m.data)) as typeof d
      } catch {
        return
      }
      if (d.topic !== this.topico) return

      const p = (d.payload ?? {}) as Record<string, unknown>
      if (d.event === 'phx_reply' && p.status === 'ok') {
        // Entrou no canal: só a partir daqui a conexão vale como boa, e é aqui
        // que a espera de religar volta ao mínimo. Zerar no `onopen` seria
        // cedo demais — uma conexão que abre e é recusada no join entraria em
        // laço apertado de reconexão.
        this.dentro = true
        this.espera = ESPERA_MIN_MS
        return
      }
      if (d.event === 'broadcast') {
        const toque = TOQUES.find(t => t === p.event)
        if (toque) this.aoTocar(toque)
      }
    }

    const cair = (): void => {
      // Uma conexão já substituída não manda mais ninguém religar: sem esta
      // guarda, o `close` tardio de um socket velho agendaria uma reconexão
      // por cima da conexão nova que já está de pé.
      if (this.ws !== ws) return
      this.limpar()
      if (this.morta) return
      this.religar = setTimeout(() => { this.religar = null; this.abrir() }, this.espera)
      this.espera = Math.min(this.espera * 2, ESPERA_MAX_MS)
    }
    ws.onclose = cair
    ws.onerror = cair
  }

  /**
   * Avisa o outro lado que mudou alguma coisa.
   *
   * Sem canal aberto, o toque é descartado em silêncio — e pode ser: o dado já
   * está no banco, e o relógio do outro lado acha ele do mesmo jeito. Guardar
   * o toque para mandar depois só adiantaria o que a próxima rodada faria.
   */
  tocar(t: Toque): void {
    if (!this.dentro) return
    this.enviar(this.topico, 'broadcast', { type: 'broadcast', event: t, payload: {} })
  }

  private limpar(): void {
    if (this.batida) { clearInterval(this.batida); this.batida = null }
    this.dentro = false
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      try { this.ws.close() } catch { /* já estava caindo */ }
      this.ws = null
    }
  }

  fechar(): void {
    this.morta = true
    if (this.religar) { clearTimeout(this.religar); this.religar = null }
    this.limpar()
  }
}
