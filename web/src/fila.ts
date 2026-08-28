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
    let pendentes = this.itens()

    while (pendentes.length > 0) {
      const item = pendentes[0]
      try {
        await enviar(item.evento)
        enviados++
        pendentes = pendentes.slice(1)
        this.gravar(pendentes)
      } catch (erro) {
        if (erro instanceof ErroDeDado) {
          descartados++
          avisos.push(erro.message)
          pendentes = pendentes.slice(1)
          this.gravar(pendentes)
          continue
        }
        // Rede, ou qualquer coisa que não soubemos classificar: o item fica,
        // com uma tentativa a mais no registro, e paramos por aqui.
        pendentes = [{ ...item, tentativas: item.tentativas + 1 }, ...pendentes.slice(1)]
        this.gravar(pendentes)
        break
      }
    }

    return { enviados, descartados, restam: pendentes.length, avisos }
  }

  private gravar(itens: ItemFila[]): void {
    this.g.gravar(CHAVE, JSON.stringify(itens))
  }
}
