/**
 * A ordem das áreas na barra lateral, escolhida arrastando.
 *
 * Mora no `localStorage`, e não na config do vault: é preferência visual
 * desta máquina, como o tamanho da janela. Mandá-la para o vault faria a
 * ordem escolhida no computador mudar a de outro aparelho sem ninguém pedir.
 *
 * A regra fica aqui, separada da tela, porque errar nela é fácil e o estrago
 * é silencioso: uma área que aparece duas vezes, ou uma que some porque a
 * ordem guardada é mais velha que o app.
 */

const CHAVE = 'cortex.ordem-lentes'

/**
 * Aplica a ordem guardada à lista de áreas.
 *
 * Quem manda é a lista REAL de áreas; a ordem guardada só diz quem vem antes
 * de quem. Área que a ordem não conhece (nova numa versão posterior) entra no
 * fim, e id que não existe mais é ignorado — sem isso, atualizar o app sumiria
 * com uma área ou duplicaria outra.
 */
export function aplicarOrdem<T extends { id: string }>(lentes: T[], ordem: string[]): T[] {
  const posicao = new Map(ordem.map((id, i) => [id, i]))
  return [...lentes].sort((a, b) => {
    const pa = posicao.get(a.id)
    const pb = posicao.get(b.id)
    if (pa === undefined && pb === undefined) return 0
    if (pa === undefined) return 1
    if (pb === undefined) return -1
    return pa - pb
  })
}

/** A lista com `arrastado` solto na posição de `alvo`. */
export function reordenar(ids: string[], arrastado: string, alvo: string): string[] {
  if (arrastado === alvo) return ids
  const de = ids.indexOf(arrastado)
  const para = ids.indexOf(alvo)
  if (de < 0 || para < 0) return ids
  const out = [...ids]
  out.splice(de, 1)
  out.splice(para, 0, arrastado)
  return out
}

export function lerOrdem(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const lista: unknown = bruto ? JSON.parse(bruto) : null
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Armazenamento bloqueado ou JSON torto: a ordem padrão resolve, e a
    // barra lateral não é lugar de mostrar erro.
    return []
  }
}

export function gravarOrdem(ids: string[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(ids))
  } catch { /* sem armazenamento, a ordem vale só nesta sessão */ }
}

/* ---------- a ordem das abas DENTRO de cada área ---------- */

const CHAVE_SUBS = 'cortex.ordem-subs'

/**
 * A ordem escolhida das abas, por área.
 *
 * Um mapa, e não uma lista: as abas de Estudos não dizem nada sobre as de
 * Saúde, e guardá-las juntas faria a ordem de uma vazar na outra.
 */
export type OrdemSubs = Record<string, string[]>

export function lerOrdemSubs(): OrdemSubs {
  try {
    const bruto = localStorage.getItem(CHAVE_SUBS)
    const o: unknown = bruto ? JSON.parse(bruto) : null
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const saida: OrdemSubs = {}
    for (const [lente, ids] of Object.entries(o as Record<string, unknown>)) {
      if (Array.isArray(ids)) saida[lente] = ids.filter((x): x is string => typeof x === 'string')
    }
    return saida
  } catch {
    return {}
  }
}

export function gravarOrdemSubs(o: OrdemSubs): void {
  try {
    localStorage.setItem(CHAVE_SUBS, JSON.stringify(o))
  } catch { /* sem armazenamento, vale só nesta sessão */ }
}
