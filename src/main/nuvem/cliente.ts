import { EVENTO_SCHEMA, type Evento, type ItemCardapio } from '../../shared/eventos'

export type EventoRemoto = Evento & { id: string; criadoEm: string }

// A sincronização roda a cada 2 minutos em segundo plano, sem ninguém acima
// com timeout próprio. Esperar demais por uma conexão pendurada (rede
// degradada, firewall que engole pacote, Supabase hibernando) é pior do que
// falhar rápido e deixar o próximo ciclo tentar de novo — por isso o teto é
// bem menor que o intervalo entre ciclos, não igual a ele.
const TIMEOUT_MS = 15_000

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
    private readonly vaultId: string,
    private readonly timeoutMs: number = TIMEOUT_MS
  ) {}

  private async rpc(funcao: string, corpo: Record<string, unknown>): Promise<unknown> {
    let r: Response
    try {
      r = await fetch(`${this.cred.url.replace(/\/$/, '')}/rest/v1/rpc/${funcao}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.cred.chave,
          authorization: `Bearer ${this.cred.chave}`
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (erro) {
      // AbortSignal.timeout aborta com um DOMException chamado 'TimeoutError'
      // (diferente do 'AbortError' de um AbortController manual) — é esse
      // nome que distingue "demorou demais" de qualquer outra falha de rede,
      // e é essa distinção que precisa chegar em quem chama.
      if (erro instanceof Error && erro.name === 'TimeoutError') {
        throw new Error(`nuvem não respondeu em ${this.timeoutMs}ms (tempo esgotado)`)
      }
      throw erro
    }

    const texto = await r.text()
    if (!r.ok) throw new Error(`nuvem respondeu ${r.status}: ${texto.slice(0, 200)}`)
    if (!texto) return null
    try {
      return JSON.parse(texto)
    } catch {
      // Um proxy pode devolver 200 com uma página de erro em HTML — o corpo
      // não é sequer JSON. Isso é uma resposta fora do contrato, não um
      // token de sintaxe qualquer, e a mensagem precisa dizer isso.
      throw new Error(`nuvem respondeu algo que não é JSON: ${texto.slice(0, 200)}`)
    }
  }

  async listarEventos(desde: string): Promise<EventoRemoto[]> {
    const bruto = await this.rpc('listar_eventos', { p_vault: this.vaultId, p_desde: desde })
    if (!Array.isArray(bruto)) {
      // Resposta de topo fora do contrato: não há lote nenhum para filtrar.
      // Tratar isso como "sem eventos novos" apagaria dado em silêncio, já
      // que quem chama usa o retorno vazio para avançar o marcador de tempo.
      throw new Error('nuvem respondeu algo inesperado para listar_eventos (esperava array)')
    }

    const out: EventoRemoto[] = []
    for (const linha of bruto as Record<string, unknown>[]) {
      // Uma linha malformada não derruba o lote: ela é descartada e as outras
      // seguem. O banco é entrada hostil como qualquer outra. Isto é
      // diferente do caso acima — aqui existe um lote, só uma linha dele é
      // ruim.
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
    if (typeof n !== 'number') {
      // Presumir sucesso aqui esconderia um erro do Postgres devolvido com
      // status 200, ou um corpo vazio — o chamador não teria como distinguir
      // isso de "publiquei todos os itens".
      throw new Error('nuvem respondeu algo inesperado para publicar_cardapio (esperava número)')
    }
    return n
  }
}
