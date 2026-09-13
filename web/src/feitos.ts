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

/**
 * Desfaz uma marcação.
 *
 * Existe porque "estudei" virou um interruptor: apertar de novo desmarca. Sem
 * isto, o evento de desmarcar sairia para o Cortex e a tela continuaria
 * mostrando o check até o cardápio voltar do banco — e o toque seguinte não
 * teria efeito nenhum, porque o botão já se daria por marcado.
 */
export function desmarcarFeito(g: Guardado, dia: string, chave: string): void {
  const atual = jaFeitos(g, dia)
  if (!atual.includes(chave)) return
  g.gravar(CHAVE, JSON.stringify({ [dia]: atual.filter(x => x !== chave) }))
}

const APAGADO = 'apagar:'

/**
 * A marca de "apaguei isto neste aparelho".
 *
 * Excluir manda o evento, e o item precisa SUMIR na hora. Antes ele ficava na
 * lista riscado, escrito "excluído", até o Cortex republicar o cardápio — com
 * o computador desligado, isso era o dia seguinte, e parecia que a exclusão
 * não tinha ido. A marca esconde o item nesse intervalo, em todas as telas
 * que o mostram.
 */
export function chaveApagado(path: string): string {
  return `${APAGADO}${path}`
}

/** Este caminho foi apagado aqui, e o Cortex ainda não o tirou do cardápio? */
export function foiApagado(feitos: string[], path: string | undefined): boolean {
  return typeof path === 'string' && path !== '' && feitos.includes(chaveApagado(path))
}

/**
 * Tira a marca do que já não vem no cardápio: o Cortex confirmou a exclusão.
 *
 * Recebe os caminhos do cardápio INTEIRO, e não só os de uma tela: a marca de
 * uma anotação apagada não pode cair porque a Chegando, que não lista
 * anotações, conferiu primeiro. Sem esta limpeza a marca ficaria até a virada
 * do dia — e um item criado de novo com o mesmo nome, que cai no mesmo
 * caminho, nasceria escondido.
 *
 * Cardápio vazio não confirma nada: é o que a tela tem antes de ele carregar,
 * e soltar a marca ali traria o item apagado de volta assim que o cardápio de
 * verdade chegasse. Devolve se mexeu, para a tela só reler quando precisar.
 */
export function conciliarApagados(g: Guardado, dia: string, caminhos: string[]): boolean {
  const publicados = new Set(caminhos.filter(c => c !== ''))
  if (publicados.size === 0) return false
  const atual = jaFeitos(g, dia)
  const resta = atual.filter(c => !c.startsWith(APAGADO) || publicados.has(c.slice(APAGADO.length)))
  if (resta.length === atual.length) return false
  g.gravar(CHAVE, JSON.stringify({ [dia]: resta }))
  return true
}
