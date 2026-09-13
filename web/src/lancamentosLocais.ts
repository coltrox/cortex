import type { Guardado } from './guardado'
import type { Transacao } from './cardapio'

const CHAVE = 'cortex.lancamentos-alterados'
const TETO = 50

/**
 * Lançamentos editados ou excluídos aqui que o Cortex ainda não devolveu.
 *
 * Mesma ponte da água, das anotações e da agenda: sem ela, excluir um gasto
 * deixava a linha na tela até a volta inteira pelo computador, e quem exclui e
 * continua vendo exclui de novo.
 *
 * O cuidado próprio daqui é a chave, que é POSIÇÃO (`data#campo#N`). Depois que
 * o Cortex apaga a linha 0, a linha que era 1 passa a ser 0 — e uma marca
 * "apagado" presa à chave esconderia o lançamento errado. Por isso a alteração
 * guarda `antes` e só vale enquanto a linha publicada naquela chave ainda for
 * a mesma. Quando deixa de ser, o Cortex já aplicou, e a marca sai.
 */
export type Alteracao = {
  chave: string
  antes: { item: string; valor: number }
  /** `null` é exclusão. */
  novo: { item: string; valor: number; cat: string; entrada: boolean } | null
}

function ler(g: Guardado): Alteracao[] {
  const bruto = g.ler(CHAVE)
  if (!bruto) return []
  try {
    const cru = JSON.parse(bruto)
    if (!Array.isArray(cru)) return []
    const out: Alteracao[] = []
    for (const a of cru) {
      // Vindo do `localStorage`: linha torta é linha descartada.
      if (!a || typeof a !== 'object') continue
      if (typeof a.chave !== 'string' || !a.antes || typeof a.antes !== 'object') continue
      if (typeof a.antes.item !== 'string' || typeof a.antes.valor !== 'number') continue
      const n = a.novo
      const novo = n === null ? null
        : n && typeof n === 'object' && typeof n.item === 'string' && typeof n.valor === 'number'
          ? { item: n.item, valor: n.valor, cat: typeof n.cat === 'string' ? n.cat : '', entrada: n.entrada === true }
          : undefined
      if (novo === undefined) continue
      out.push({ chave: a.chave, antes: { item: a.antes.item, valor: a.antes.valor }, novo })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Guarda a alteração; uma segunda na mesma linha substitui a primeira.
 *
 * Substitui o `novo`, mas FICA com o `antes` da primeira: é ele que ainda está
 * publicado, e é contra ele que `comAlteracoes` confere. Com o `antes` da
 * segunda (a primeira edição, que o Cortex ainda não aplicou), a marca seria
 * dada como aplicada e a tela voltaria ao valor original até a volta.
 */
export function guardarAlteracao(g: Guardado, a: Alteracao): Alteracao[] {
  const anterior = ler(g).find(x => x.chave === a.chave)
  const nova = anterior ? { ...a, antes: anterior.antes } : a
  const lista = [...ler(g).filter(x => x.chave !== a.chave), nova].slice(-TETO)
  g.gravar(CHAVE, JSON.stringify(lista))
  return lista
}

const mesma = (t: Transacao, antes: Alteracao['antes']): boolean =>
  t.item === antes.item && t.valor === antes.valor

/**
 * A lista que a tela mostra: o publicado, com as alterações ainda pendentes
 * por cima. Fecha a ponte no caminho — o que o Cortex já aplicou sai daqui.
 */
export function comAlteracoes(g: Guardado, publicadas: Transacao[]): Transacao[] {
  const porChave = new Map(publicadas.map(t => [t.chave, t]))
  const pendentes = ler(g).filter(a => {
    const t = porChave.get(a.chave)
    return t !== undefined && mesma(t, a.antes)
  })
  g.gravar(CHAVE, JSON.stringify(pendentes))

  const alt = new Map(pendentes.map(a => [a.chave, a]))
  const out: Transacao[] = []
  for (const t of publicadas) {
    const a = alt.get(t.chave)
    if (!a) { out.push(t); continue }
    if (a.novo === null) continue
    out.push({ ...t, ...a.novo })
  }
  return out
}

/**
 * Esta linha divide a lista com uma alteração ainda no caminho?
 *
 * Editar a linha 2 enquanto a exclusão da linha 1 não chegou mandaria a
 * edição para uma posição que vai andar — e o Cortex a recusaria. Travar a
 * lista daquele dia até a volta evita o toque que não vai dar em nada.
 */
export function listaOcupada(g: Guardado, t: Transacao): boolean {
  const prefixo = t.chave.slice(0, t.chave.lastIndexOf('#'))
  return ler(g).some(a => a.chave !== t.chave && a.chave.startsWith(`${prefixo}#`))
}
