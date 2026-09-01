import {
  validarEvento, ESPECIES_CARDAPIO, type Evento, type ItemCardapio
} from '@compartilhado/eventos'
import { ErroDeDado, ErroDeRede } from './erros'

export type Credencial = { url: string; chave: string }

const TIMEOUT_MS = 15_000

/** Do contrato compartilhado — ver o comentário em `cardapio.ts`. */
const ESPECIES = ESPECIES_CARDAPIO

/**
 * Conversa com as funções RPC do Supabase.
 *
 * Só chama funções, nunca as tabelas: elas estão com RLS ligado e sem policy
 * nenhuma, e todo acesso passa por funções que exigem o id do vault.
 *
 * Repare no que NÃO existe aqui: nenhum método que leia eventos, edite ou
 * apague. O celular é um caderninho de bolso — escreve o dia e lê o cardápio.
 * A ausência do resto é o desenho, não um pedaço faltando.
 *
 * A diferença para `src/main/nuvem/cliente.ts`, do desktop, é a classificação
 * do erro: aqui ela decide se o registro fica na fila ou é descartado, e por
 * isso é explícita.
 */
export class ClienteWeb {
  constructor(
    private readonly cred: Credencial,
    private readonly vaultId: string,
    private readonly timeoutMs: number = TIMEOUT_MS,
    private readonly buscar: typeof fetch = (...a) => fetch(...a)
  ) {}

  private async rpc(funcao: string, corpo: Record<string, unknown>): Promise<unknown> {
    let r: Response
    try {
      r = await this.buscar(`${this.cred.url.replace(/\/$/, '')}/rest/v1/rpc/${funcao}`, {
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
      // Conexão que não saiu, DNS que não resolveu, tempo esgotado: tudo isso
      // o tempo resolve.
      throw new ErroDeRede(erro instanceof Error ? erro.message : 'falha de conexão')
    }

    const texto = await r.text()

    if (!r.ok) {
      // 4xx é o banco dizendo que a requisição está errada — repetir amanhã dá
      // o mesmo resultado. Menos 408 e 429, que são "agora não" e não "nunca":
      // tratá-los como erro de dado jogaria fora um registro por causa de um
      // limite de chamadas.
      const doDado = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429
      const mensagem = `nuvem respondeu ${r.status}: ${texto.slice(0, 200)}`
      throw doDado ? new ErroDeDado(mensagem) : new ErroDeRede(mensagem)
    }

    if (!texto) return null
    try {
      return JSON.parse(texto)
    } catch {
      // 200 com HTML é portal de wi-fi ou proxy, não resposta do banco.
      throw new ErroDeRede(`nuvem respondeu algo que não é JSON: ${texto.slice(0, 200)}`)
    }
  }

  async registrarEvento(evento: Evento): Promise<string> {
    let valido: Evento
    try {
      // Validar antes de sair: um evento torto seria recusado pelo banco de
      // qualquer jeito, e falhar aqui gasta menos e diz melhor o motivo.
      valido = validarEvento(evento)
    } catch (erro) {
      throw new ErroDeDado(erro instanceof Error ? erro.message : 'evento inválido')
    }

    const id = await this.rpc('registrar_evento', {
      p_vault: this.vaultId,
      p_dia: valido.dia,
      p_tipo: valido.tipo,
      p_dados: valido.dados
    })
    return typeof id === 'string' ? id : ''
  }

  async listarCardapio(): Promise<ItemCardapio[]> {
    const bruto = await this.rpc('listar_cardapio', { p_vault: this.vaultId })
    if (!Array.isArray(bruto)) {
      throw new ErroDeRede('nuvem respondeu algo inesperado para listar_cardapio')
    }

    const out: ItemCardapio[] = []
    for (const linha of bruto as Record<string, unknown>[]) {
      // Uma linha estranha não derruba o cardápio inteiro: um Cortex mais novo
      // pode publicar uma espécie que este app ainda não conhece.
      const especie = ESPECIES.find(e => e === linha.especie)
      if (!especie || typeof linha.nome !== 'string') continue
      const detalhe = linha.detalhe
      out.push({
        especie,
        nome: linha.nome,
        detalhe: detalhe && typeof detalhe === 'object' && !Array.isArray(detalhe)
          ? (detalhe as Record<string, unknown>)
          : {}
      })
    }
    return out
  }
}
