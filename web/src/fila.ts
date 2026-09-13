import { EVENTO_SCHEMA, type Evento } from '@compartilhado/eventos'
import type { Guardado } from './guardado'
import { ErroDeDado } from './erros'

const CHAVE = 'cortex.fila'

/**
 * Teto de itens guardados.
 *
 * Não é o caso de uso normal — é a proteção contra um laço com defeito numa
 * tela enchendo o `localStorage` até o navegador começar a recusar escrita.
 * Ao estourar, saem os mais antigos: quem ficou meses offline quer os
 * registros recentes.
 */
const TETO = 500

export type ItemFila = {
  id: string
  evento: Evento
  criadoEm: number
  tentativas: number
}

export type Drenagem = {
  enviados: number
  descartados: number
  restam: number
  avisos: string[]
}

/**
 * A fila de saída. Todo envio do app passa por aqui.
 *
 * Ela relê o armazenamento a cada operação em vez de guardar a lista num
 * campo: o app pode estar aberto em duas abas, e a que escreve por último não
 * pode apagar o registro que a outra acabou de fazer.
 */
export class Fila {
  constructor(
    private readonly g: Guardado,
    private readonly novoId: () => string = () => crypto.randomUUID()
  ) {}

  itens(): ItemFila[] {
    const bruto = this.g.ler(CHAVE)
    if (!bruto) return []
    let cru: unknown
    try {
      cru = JSON.parse(bruto)
    } catch {
      // Armazenamento corrompido. Recomeçar vazio é a única saída que não
      // trava o app para sempre.
      return []
    }
    if (!Array.isArray(cru)) return []

    const out: ItemFila[] = []
    for (const linha of cru) {
      if (!linha || typeof linha !== 'object') continue
      const l = linha as Record<string, unknown>
      const r = EVENTO_SCHEMA.safeParse(l.evento)
      // Um item que uma versão antiga gravou noutro formato é lixo: mandá-lo
      // ao banco só produziria um erro que ninguém sabe ler.
      if (!r.success || typeof l.id !== 'string') continue
      out.push({
        id: l.id,
        evento: r.data,
        criadoEm: typeof l.criadoEm === 'number' ? l.criadoEm : 0,
        tentativas: typeof l.tentativas === 'number' ? l.tentativas : 0
      })
    }
    return out
  }

  quantos(): number {
    return this.itens().length
  }

  enfileirar(evento: Evento): ItemFila {
    const item: ItemFila = { id: this.novoId(), evento, criadoEm: Date.now(), tentativas: 0 }
    this.gravar([...this.itens(), item].slice(-TETO))
    return item
  }

  /**
   * Tenta mandar cada item, na ordem.
   *
   * Para no primeiro erro de rede em vez de percorrer o resto: insistir sem
   * sinal só gasta bateria, e a ordem importa quando dois eventos tocam o
   * mesmo dia no vault.
   */
  async esvaziar(enviar: (e: Evento) => Promise<unknown>): Promise<Drenagem> {
    const avisos: string[] = []
    let enviados = 0
    let descartados = 0
    const tentados = new Set<string>()

    /*
     * Relê o armazenamento a CADA item, e mexe só no item enviado, pelo id.
     *
     * Antes a fila era lida uma vez no começo, e depois de cada envio aquela
     * foto era gravada por cima do armazenamento. Tudo o que fosse enfileirado
     * DURANTE um envio — uns 300 ms de rede — era apagado pela gravação
     * seguinte. Tocar em água, creatina e café em sequência mandava só a água:
     * os outros dois sumiam sem aviso, com a tela mostrando os três marcados.
     * Achado no teste de ponta a ponta de 13/09/2026.
     *
     * Reler também faz o que chegou no meio sair nesta mesma rodada.
     */
    for (;;) {
      const item = this.itens().find(i => !tentados.has(i.id))
      if (!item) break
      tentados.add(item.id)
      try {
        await enviar(item.evento)
        enviados++
        this.remover(item.id)
      } catch (erro) {
        if (erro instanceof ErroDeDado) {
          descartados++
          avisos.push(erro.message)
          this.remover(item.id)
          continue
        }
        // Rede, ou qualquer coisa que não soubemos classificar: o item fica,
        // com uma tentativa a mais no registro, e paramos por aqui.
        this.gravar(this.itens().map(i =>
          i.id === item.id ? { ...i, tentativas: i.tentativas + 1 } : i))
        break
      }
    }

    return { enviados, descartados, restam: this.quantos(), avisos }
  }

  private remover(id: string): void {
    this.gravar(this.itens().filter(i => i.id !== id))
  }

  private gravar(itens: ItemFila[]): void {
    this.g.gravar(CHAVE, JSON.stringify(itens))
  }
}
