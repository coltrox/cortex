import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import type { CorpoEvento, EventoGoogle } from './logica'

/**
 * A conversa com o Google: login (OAuth de app de computador) e a API do
 * Google Agenda. Sem biblioteca do Google — são meia dúzia de chamadas HTTP,
 * e uma dependência daquele tamanho entraria no pacote de todo mundo.
 *
 * O login é o fluxo "loopback" que o Google recomenda para app instalado:
 * o Cortex abre um servidor só em 127.0.0.1, numa porta livre, manda o
 * navegador para a página oficial do Google, e recebe o código de volta
 * nesse endereço. Com PKCE e `state`: um código roubado no caminho não serve
 * sem o verificador, e uma resposta que não foi pedida por este login é
 * recusada. A senha da conta nunca passa pelo Cortex.
 */

/**
 * Só o calendário que o próprio Cortex cria. Com este escopo o app não
 * enxerga nem mexe em nenhum outro calendário da conta.
 */
export const ESCOPO = 'https://www.googleapis.com/auth/calendar.app.created'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const REVOGAR = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'

export type Cliente = { clientId: string; clientSecret: string }

/**
 * O cliente OAuth assado no build, pelo `.env` (fora do git) — é o que deixa
 * quem usa só apertar "Conectar com o Google", sem arquivo nenhum. Sem ele,
 * a aba cai no plano B de escolher o JSON à mão.
 */
export function clienteDoBuild(): Cliente | null {
  const clientId = import.meta.env?.MAIN_VITE_GOOGLE_CLIENT_ID
  const clientSecret = import.meta.env?.MAIN_VITE_GOOGLE_CLIENT_SECRET
  return typeof clientId === 'string' && clientId !== '' && typeof clientSecret === 'string' && clientSecret !== ''
    ? { clientId, clientSecret }
    : null
}

/** O login expirou ou foi revogado: só entrando de novo. */
export class ErroDeLogin extends Error {}
/** O calendário "Cortex" foi apagado no Google. */
export class CalendarioSumiu extends Error {}

/**
 * Lê o JSON que o Google Cloud baixa para um cliente "App para computador".
 * Confere o formato antes de guardar: o arquivo vem do disco, escolhido à mão.
 */
export function lerArquivoCliente(texto: string): Cliente | null {
  let o: unknown
  try { o = JSON.parse(texto) } catch { return null }
  const inst = (o as { installed?: Record<string, unknown> } | null)?.installed
  if (!inst) return null
  const { client_id: id, client_secret: segredo } = inst
  if (typeof id !== 'string' || !/^[\w-]{10,120}\.apps\.googleusercontent\.com$/.test(id)) return null
  if (typeof segredo !== 'string' || segredo.length < 10 || segredo.length > 200) return null
  return { clientId: id, clientSecret: segredo }
}

const base64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const pagina = (titulo: string, texto: string): string => `<!doctype html><meta charset="utf-8"><title>Cortex</title>
<body style="font-family:system-ui;background:#181818;color:#f1f1f1;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>${titulo}</h2><p>${texto}</p></div>`

/**
 * Faz o login e devolve o refresh token.
 *
 * `abrir` abre a URL no navegador do sistema — passada de fora para este
 * arquivo não depender do Electron.
 */
export async function autorizar(
  cliente: Cliente,
  abrir: (url: string) => Promise<void>,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const verificador = base64url(randomBytes(48))
  const desafio = base64url(createHash('sha256').update(verificador).digest())
  const state = base64url(randomBytes(24))

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let redirectUri = ''
    const servidor = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/') { res.writeHead(404).end(); return }
      const fim = (ok: boolean, msg: string): void => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ok
          ? pagina('Pronto!', 'O Cortex já está ligado ao Google Agenda. Pode fechar esta aba.')
          : pagina('Não deu para conectar', `${msg} Volte ao Cortex e tente de novo.`))
        clearTimeout(limite)
        servidor.close()
      }
      const erro = url.searchParams.get('error')
      const codigo = url.searchParams.get('code')
      if (url.searchParams.get('state') !== state) {
        fim(false, 'A resposta não era deste login.')
        reject(new Error('login recusado: a resposta não era deste login'))
      } else if (erro) {
        fim(false, 'O acesso não foi autorizado.')
        reject(new Error(`o Google recusou o acesso (${erro.slice(0, 60)})`))
      } else if (!codigo) {
        fim(false, 'O Google não devolveu o código.')
        reject(new Error('o Google não devolveu o código do login'))
      } else {
        fim(true, '')
        resolve({ code: codigo, redirectUri })
      }
    })
    // Cinco minutos para a pessoa terminar o login no navegador.
    const limite = setTimeout(() => {
      servidor.close()
      reject(new Error('o login demorou demais e foi cancelado'))
    }, 5 * 60_000)
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address()
      if (!endereco || typeof endereco === 'string') {
        clearTimeout(limite)
        reject(new Error('não deu para abrir a porta do login'))
        return
      }
      redirectUri = `http://127.0.0.1:${endereco.port}`
      const params = new URLSearchParams({
        client_id: cliente.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: ESCOPO,
        access_type: 'offline',
        // `consent` garante um refresh token mesmo em quem já autorizou antes.
        prompt: 'consent',
        state,
        code_challenge: desafio,
        code_challenge_method: 'S256'
      })
      abrir(`${AUTH}?${params}`).catch(err => {
        clearTimeout(limite)
        servidor.close()
        reject(err)
      })
    })
  })

  const r = await fetchFn(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cliente.clientId,
      client_secret: cliente.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verificador
    })
  })
  const j = await r.json().catch(() => ({})) as { refresh_token?: unknown; error?: unknown }
  if (!r.ok || typeof j.refresh_token !== 'string') {
    throw new Error(`o Google não entregou o acesso (${typeof j.error === 'string' ? j.error : r.status})`)
  }
  return j.refresh_token
}

/** O Google Agenda de uma conta já autorizada. */
export class ApiAgenda {
  private acesso: { token: string; expira: number } | null = null

  constructor(
    private cliente: Cliente,
    private refreshToken: string,
    private fetchFn: typeof fetch = fetch
  ) {}

  private async token(): Promise<string> {
    if (this.acesso && Date.now() < this.acesso.expira) return this.acesso.token
    const r = await this.fetchFn(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.cliente.clientId,
        client_secret: this.cliente.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      })
    })
    const j = await r.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown; error?: unknown }
    if (j.error === 'invalid_grant') throw new ErroDeLogin('o acesso ao Google expirou ou foi removido — conecte de novo')
    if (!r.ok || typeof j.access_token !== 'string') throw new Error(`não deu para renovar o acesso ao Google (${r.status})`)
    const segundos = typeof j.expires_in === 'number' ? j.expires_in : 3600
    this.acesso = { token: j.access_token, expira: Date.now() + (segundos - 60) * 1000 }
    return this.acesso.token
  }

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await this.fetchFn(`${API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined
    })
    if (r.status === 401) { this.acesso = null; throw new ErroDeLogin('o Google recusou o acesso — conecte de novo') }
    // Apagar o que já não existe é sucesso: o objetivo era não existir.
    if (metodo === 'DELETE' && (r.status === 204 || r.status === 404 || r.status === 410)) return undefined as T
    if (r.status === 404) throw new CalendarioSumiu('o calendário do Cortex não foi encontrado no Google')
    if (!r.ok) {
      const j = await r.json().catch(() => ({})) as { error?: { message?: unknown } }
      const msg = typeof j.error?.message === 'string' ? j.error.message.slice(0, 160) : String(r.status)
      throw new Error(`Google Agenda: ${msg}`)
    }
    return await r.json() as T
  }

  async criarCalendario(): Promise<string> {
    const c = await this.chamar<{ id?: unknown }>('POST', '/calendars', { summary: 'Cortex', timeZone: 'America/Sao_Paulo' })
    if (typeof c.id !== 'string') throw new Error('o Google não devolveu o calendário criado')
    return c.id
  }

  /** Todos os eventos do calendário, inclusive os apagados (é assim que se sabe o que sumiu). */
  async listarEventos(calendario: string): Promise<EventoGoogle[]> {
    const out: EventoGoogle[] = []
    let proxima: string | undefined
    for (let voltas = 0; voltas < 50; voltas++) {
      const q = new URLSearchParams({ showDeleted: 'true', maxResults: '2500' })
      if (proxima) q.set('pageToken', proxima)
      const r = await this.chamar<{ items?: unknown; nextPageToken?: unknown }>(
        'GET', `/calendars/${encodeURIComponent(calendario)}/events?${q}`
      )
      if (Array.isArray(r.items)) {
        for (const e of r.items) {
          if (e && typeof (e as EventoGoogle).id === 'string') out.push(e as EventoGoogle)
        }
      }
      proxima = typeof r.nextPageToken === 'string' ? r.nextPageToken : undefined
      if (!proxima) break
    }
    return out
  }

  /**
   * As ocorrências de eventos que se repetem, numa janela de datas.
   *
   * A lista normal traz só o evento-mãe (com a regra de repetição); o Cortex
   * não tem compromisso repetido, então lê cada ocorrência como um evento.
   * Janela curta de propósito: um "toda segunda" sem fim viraria centenas de
   * notas.
   */
  async listarRepeticoes(calendario: string, de: string, ate: string): Promise<EventoGoogle[]> {
    const out: EventoGoogle[] = []
    let proxima: string | undefined
    for (let voltas = 0; voltas < 20; voltas++) {
      const q = new URLSearchParams({
        singleEvents: 'true', showDeleted: 'true', maxResults: '2500',
        timeMin: `${de}T00:00:00-03:00`, timeMax: `${ate}T23:59:59-03:00`
      })
      if (proxima) q.set('pageToken', proxima)
      const r = await this.chamar<{ items?: unknown; nextPageToken?: unknown }>(
        'GET', `/calendars/${encodeURIComponent(calendario)}/events?${q}`
      )
      if (Array.isArray(r.items)) {
        for (const e of r.items) {
          const ev = e as EventoGoogle
          if (ev && typeof ev.id === 'string' && typeof ev.recurringEventId === 'string') out.push(ev)
        }
      }
      proxima = typeof r.nextPageToken === 'string' ? r.nextPageToken : undefined
      if (!proxima) break
    }
    return out
  }

  async inserir(calendario: string, corpo: CorpoEvento): Promise<{ id: string; atualizado: string }> {
    const e = await this.chamar<EventoGoogle>('POST', `/calendars/${encodeURIComponent(calendario)}/events`, corpo)
    return { id: e.id, atualizado: typeof e.updated === 'string' ? e.updated : '' }
  }

  async atualizar(calendario: string, id: string, corpo: Partial<CorpoEvento>): Promise<{ atualizado: string }> {
    const e = await this.chamar<EventoGoogle>(
      'PATCH', `/calendars/${encodeURIComponent(calendario)}/events/${encodeURIComponent(id)}`, corpo
    )
    return { atualizado: typeof e.updated === 'string' ? e.updated : '' }
  }

  async apagar(calendario: string, id: string): Promise<void> {
    await this.chamar<void>('DELETE', `/calendars/${encodeURIComponent(calendario)}/events/${encodeURIComponent(id)}`)
  }

  /** Tira o acesso do Cortex na conta Google. Falha em silêncio: desconectar vale mesmo sem rede. */
  async revogar(): Promise<void> {
    await this.fetchFn(`${REVOGAR}?token=${encodeURIComponent(this.refreshToken)}`, { method: 'POST' }).catch(() => {})
  }
}
