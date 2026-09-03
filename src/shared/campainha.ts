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
  /** Toques feitos com o canal fechado, esperando ele entrar. Ver `tocar`. */
  private readonly pendentes = new Set<Toque>()
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
        // O que foi tocado com o canal fechado sai agora — ver `tocar`.
        this.soltarPendentes()
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
   * Sem canal aberto, o toque ESPERA o canal entrar em vez de sumir.
   *
   * Ele já foi descartado em silêncio, com o argumento de que o relógio do
   * outro lado acharia o dado de qualquer jeito. Acha mesmo — só que dois
   * minutos depois, e o caso em que o toque some é justamente o mais comum no
   * celular: tela apagada e app em segundo plano fazem o navegador suspender
   * o websocket, então o canal quase nunca está de pé no instante em que
   * alguém abre o app e marca alguma coisa. O resultado era desmarcar no
   * celular e olhar o Cortex ainda marcado, sem nada explicando por quê.
   *
   * O que espera é só a intenção de avisar — nunca o dado, que já está no
   * banco. Por isso é um conjunto e não uma fila: dois toques iguais antes de
   * o canal abrir valem um só, e a ordem entre 'eventos' e 'cardapio' não diz
   * nada. E por isso também não há retentativa própria: se o canal não abrir,
   * o relógio do outro lado continua sendo a rede de segurança.
   */
  tocar(t: Toque): void {
    if (!this.dentro) {
      this.pendentes.add(t)
      // Uma conexão caída já tem religamento agendado por `cair`. Mas uma que
      // nunca foi aberta não tem ninguém para abri-la — e é aí que abrir agora
      // transforma o toque guardado em toque entregue.
      if (!this.ws && !this.religar && !this.morta) this.abrir()
      return
    }
    this.enviar(this.topico, 'broadcast', { type: 'broadcast', event: t, payload: {} })
  }

  /**
   * Reconecta AGORA, sem esperar o backoff.
   *
   * Existe por causa do celular. Em segundo plano o sistema congela o
   * WebSocket e os timers junto — inclusive o `setTimeout` que religaria. Ao
   * voltar para a tela, a conexão está morta e o religamento pode estar
   * agendado para dali a meio minuto (a espera dobra a cada queda, até 30 s).
   * Nesse intervalo o celular fica surdo: o Cortex publica, toca, e o toque
   * não encontra ninguém — a tela só se corrige no relógio de dois minutos.
   *
   * Um broadcast é tiro único e não se guarda no servidor. Por isso quem
   * volta à tela tem de reconectar na hora E buscar de novo: a reconexão
   * cobre os toques seguintes, e a busca cobre o toque que já se perdeu.
   */
  acordar(): void {
    if (this.morta || this.dentro) return
    if (this.religar) { clearTimeout(this.religar); this.religar = null }
    // A espera volta ao mínimo: quem acabou de abrir o app não deve herdar o
    // castigo acumulado por quedas de quando o aparelho estava dormindo.
    this.espera = ESPERA_MIN_MS
    // Um socket que sobrou de antes é descartado: depois de o aparelho
    // dormir ele costuma ficar zumbi — nem aberto nem fechado, e sem nunca
    // disparar `onclose` para avisar.
    this.limpar()
    this.abrir()
  }

  /** Solta o que ficou esperando o canal. Chamado no instante em que ele entra. */
  private soltarPendentes(): void {
    if (this.pendentes.size === 0) return
    const guardados = [...this.pendentes]
    this.pendentes.clear()
    for (const t of guardados) {
      this.enviar(this.topico, 'broadcast', { type: 'broadcast', event: t, payload: {} })
    }
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
    // Intenção de avisar não sobrevive ao fechamento: quem fecha trocou de
    // vault ou está saindo, e um toque guardado aqui avisaria o Cortex errado.
    this.pendentes.clear()
    this.limpar()
  }
}
