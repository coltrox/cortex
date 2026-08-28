import type { Guardado } from './guardado'

const CHAVE = 'cortex.feitos'

/**
 * O que já foi marcado, por dia.
 *
 * O app não lê histórico do banco — então, sem isto, o check do suplemento
 * voltaria desmarcado a cada recarregamento e a creatina seria registrada três
 * vezes. Isto é memória local da tela, não dado: a verdade continua sendo o
 * vault.
 *
 * Guarda só o dia informado na última gravação. O passado não tem para que
 * servir aqui, e um mapa que cresce para sempre é a maneira de estourar o
 * `localStorage` sem perceber.
 */
type Mapa = Record<string, string[]>

function ler(g: Guardado): Mapa {
  const bruto = g.ler(CHAVE)
  if (!bruto) return {}
  try {
    const cru = JSON.parse(bruto)
    return cru && typeof cru === 'object' && !Array.isArray(cru) ? (cru as Mapa) : {}
  } catch {
    return {}
  }
}

export function jaFeitos(g: Guardado, dia: string): string[] {
  const lista = ler(g)[dia]
  return Array.isArray(lista) ? lista.filter(x => typeof x === 'string') : []
}

export function marcarFeito(g: Guardado, dia: string, chave: string): void {
  const atual = jaFeitos(g, dia)
  if (atual.includes(chave)) return
  // Só o dia informado sobrevive à gravação — é a poda dos dias antigos.
  g.gravar(CHAVE, JSON.stringify({ [dia]: [...atual, chave] }))
}
