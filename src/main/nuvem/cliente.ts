import { EVENTO_SCHEMA, type Evento, type ItemCardapio } from '../../shared/eventos'

export type EventoRemoto = Evento & { id: string; criadoEm: string }

/**
 * Conversa com as funções RPC do Supabase.
 *
 * Usa `fetch` nativo do Node 22 — nenhuma biblioteca HTTP nova. Só chama
 * funções, nunca as tabelas: elas estão com RLS ligado e sem policy, e o
 * acesso passa por funções que exigem o id do vault.
 *
 * Note o que NÃO existe aqui: nenhum método que escreva em `eventos`. O
 * Cortex lê eventos e publica cardápio, e a ausência é intencional.
 */
export class ClienteNuvem {
  constructor(
    private readonly cred: { url: string; chave: string },
    private readonly vaultId: string
  ) {}

  private async rpc(funcao: string, corpo: Record<string, unknown>): Promise<unknown> {
    const r = await fetch(`${this.cred.url.replace(/\/$/, '')}/rest/v1/rpc/${funcao}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: this.cred.chave,
        authorization: `Bearer ${this.cred.chave}`
      },
      body: JSON.stringify(corpo)
    })
    const texto = await r.text()
    if (!r.ok) throw new Error(`nuvem respondeu ${r.status}: ${texto.slice(0, 200)}`)
    return texto ? JSON.parse(texto) : null
  }

  async listarEventos(desde: string): Promise<EventoRemoto[]> {
    const bruto = await this.rpc('listar_eventos', { p_vault: this.vaultId, p_desde: desde })
    if (!Array.isArray(bruto)) return []

    const out: EventoRemoto[] = []
    for (const linha of bruto as Record<string, unknown>[]) {
      // Uma linha malformada não derruba o lote: ela é descartada e as outras
      // seguem. O banco é entrada hostil como qualquer outra.
      const r = EVENTO_SCHEMA.safeParse({
        tipo: linha.tipo, dia: linha.dia, dados: linha.dados ?? {}
      })
      if (!r.success || typeof linha.id !== 'string') continue
      out.push({ ...r.data, id: linha.id, criadoEm: String(linha.criado_em ?? '') })
    }
    return out
  }

  async publicarCardapio(itens: ItemCardapio[]): Promise<number> {
    const n = await this.rpc('publicar_cardapio', { p_vault: this.vaultId, p_itens: itens })
    return typeof n === 'number' ? n : itens.length
  }
}
