import type { Guardado } from './guardado'

const CHAVE = 'cortex.agua'

/**
 * A água que já foi tocada mas ainda não voltou do Cortex.
 *
 * O total de verdade mora no vault, e o celular só o recebe depois da volta
 * inteira: toque → fila → Supabase → campainha → o Cortex acorda, escreve o
 * diário e republica. Com o computador desligado — que é exatamente onde o
 * Pedro está quando bebe água — essa volta não acontece hoje. Sem esta ponte,
 * ele tocaria o botão a manhã inteira e o número não sairia do lugar.
 *
 * Não é uma segunda contagem: é a distância entre o que ele tocou e o que o
 * vault já sabe. Por isso guarda `base` — o total do cardápio no momento em
 * que a conta foi acertada pela última vez. Quando um cardápio novo chega, o
 * que o Cortex absorveu sai do pendente, e o que sobrou continua esperando.
 *
 * Guarda um dia só. O pendente de ontem não serve para nada, e um mapa que
 * cresce para sempre é a maneira de estourar o `localStorage` sem perceber.
 */
type Pendente = { dia: string; base: number; delta: number }

const VAZIO: Pendente = { dia: '', base: 0, delta: 0 }

const numero = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0

function ler(g: Guardado, dia: string): Pendente {
  const bruto = g.ler(CHAVE)
  if (!bruto) return { ...VAZIO, dia }
  try {
    const cru = JSON.parse(bruto)
    if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return { ...VAZIO, dia }
    const p = cru as Record<string, unknown>
    // Virou o dia: o pendente de ontem não tem para onde ir.
    if (p.dia !== dia) return { ...VAZIO, dia }
    return { dia, base: numero(p.base), delta: numero(p.delta) }
  } catch {
    return { ...VAZIO, dia }
  }
}

const gravar = (g: Guardado, p: Pendente): void => g.gravar(CHAVE, JSON.stringify(p))

/** Quanto o celular já contou e o vault ainda não confirmou. Pode ser negativo. */
export function lerPendente(g: Guardado, dia: string): number {
  return ler(g, dia).delta
}

/**
 * O toque no botão. `ml` negativo é o desfazer.
 *
 * Só mexe no pendente — o evento que sai para o Cortex é montado à parte, e é
 * ele quem manda de verdade.
 */
export function somarPendente(g: Guardado, dia: string, ml: number): number {
  const p = ler(g, dia)
  const delta = p.delta + (Number.isFinite(ml) ? ml : 0)
  gravar(g, { ...p, delta })
  return delta
}

/**
 * Chegou cardápio novo: tira do pendente o que o Cortex já absorveu.
 *
 * A conta só encolhe o pendente em direção a zero, nunca o aumenta nem troca
 * o sinal. Isso importa no caso em que o total do vault muda por outro motivo
 * — o Pedro editando o diário na mão, uma reindexação — quando somar a
 * diferença ao pendente ressuscitaria água que ele acabou de apagar.
 */
export function conciliarPendente(g: Guardado, dia: string, doCardapio: number): number {
  const p = ler(g, dia)
  const novo = numero(doCardapio)
  const bruto = p.delta - (novo - p.base)
  const delta = p.delta >= 0
    ? Math.min(Math.max(bruto, 0), p.delta)
    : Math.max(Math.min(bruto, 0), p.delta)
  gravar(g, { dia, base: novo, delta })
  return delta
}

/** O que a tela mostra: o que o vault sabe mais o que ainda está a caminho. */
export const totalNaTela = (doCardapio: number, pendente: number): number =>
  Math.max(0, numero(doCardapio) + numero(pendente))
