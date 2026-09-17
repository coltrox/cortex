import type { Guardado } from './guardado'
import type { Transacao } from './cardapio'

const CHAVE = 'cortex.dinheiro-local'
/** Dois dias: se o Cortex não devolveu até lá, algo mais sério aconteceu, e a tela não pode mentir para sempre. */
const VALIDADE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Gastos, ganhos e movimentos do porquinho lançados aqui e ainda não
 * devolvidos pelo Cortex.
 *
 * A mesma ponte da água, das medidas e das anotações: entre tocar em lançar e
 * o valor aparecer existe a volta inteira pelo computador. Sem isto a lista e
 * o saldo ficavam iguais ao que eram antes do toque, e quem lança conclui que
 * não foi e lança de novo.
 *
 * Como saber que o Cortex absorveu, se lançamento não tem id:
 *  - Gasto: guarda quantos lançamentos IGUAIS (mesma data, item, valor e
 *    direção) já estavam publicados ou a caminho no momento do toque —
 *    `base`. Quando o publicado passa desse número, este já chegou.
 *  - Porquinho: guarda o saldo esperado ANTES deste movimento — `base`.
 *    Quando o saldo publicado bate com `base + valor`, este e os anteriores
 *    já chegaram.
 */

export type GastoLocal = {
  id: string
  data: string
  item: string
  valor: number
  cat: string
  entrada: boolean
  base: number
  criadoEm: number
}

export type MovimentoLocal = { valor: number; base: number; criadoEm: number }

type Dados = { gastos: GastoLocal[]; cofre: MovimentoLocal[] }

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function ler(g: Guardado): Dados {
  const bruto = g.ler(CHAVE)
  if (!bruto) return { gastos: [], cofre: [] }
  try {
    const o = JSON.parse(bruto) as Partial<Dados>
    // Vindo do localStorage: linha torta é linha descartada.
    const gastos = Array.isArray(o.gastos) ? o.gastos.filter(x =>
      x && typeof x.id === 'string' && typeof x.data === 'string' && typeof x.item === 'string' &&
      finito(x.valor) && typeof x.cat === 'string' && typeof x.entrada === 'boolean' &&
      finito(x.base) && finito(x.criadoEm)) : []
    const cofre = Array.isArray(o.cofre) ? o.cofre.filter(x =>
      x && finito(x.valor) && finito(x.base) && finito(x.criadoEm)) : []
    return { gastos, cofre }
  } catch {
    return { gastos: [], cofre: [] }
  }
}

const gravar = (g: Guardado, d: Dados): void => g.gravar(CHAVE, JSON.stringify(d))

const assinatura = (t: { data: string; item: string; valor: number; entrada: boolean }): string =>
  `${t.data}|${t.item.trim()}|${Math.round(t.valor * 100)}|${t.entrada ? 'e' : 's'}`

/** Guarda um gasto ou ganho que acabou de ser lançado. */
export function guardarGasto(
  g: Guardado,
  publicadas: Transacao[],
  novo: { data: string; item: string; valor: number; cat: string; entrada: boolean },
  agora = Date.now()
): void {
  const d = ler(g)
  const sig = assinatura(novo)
  const jaPublicadas = publicadas.filter(t => assinatura(t) === sig).length
  const pendentesIguais = d.gastos.filter(x => assinatura(x) === sig).length
  d.gastos.push({
    ...novo,
    item: novo.item.trim(),
    id: `${agora}-${Math.random().toString(36).slice(2, 8)}`,
    base: jaPublicadas + pendentesIguais,
    criadoEm: agora
  })
  gravar(g, d)
}

/**
 * As transações publicadas mais as que ainda estão a caminho.
 *
 * Também faz a faxina: o que o Cortex já devolveu, e o que passou da
 * validade, sai do disco aqui. As locais têm chave `local#…` — não dá para
 * editar nem excluir o que o vault ainda não tem.
 */
export function comGastosLocais(g: Guardado, publicadas: Transacao[], agora = Date.now()): Transacao[] {
  const d = ler(g)
  const contagem = new Map<string, number>()
  for (const t of publicadas) {
    const sig = assinatura(t)
    contagem.set(sig, (contagem.get(sig) ?? 0) + 1)
  }
  const restam = d.gastos.filter(x =>
    agora - x.criadoEm < VALIDADE_MS && (contagem.get(assinatura(x)) ?? 0) <= x.base)
  if (restam.length !== d.gastos.length) gravar(g, { ...d, gastos: restam })
  const locais: Transacao[] = restam.map(x => ({
    chave: `local#${x.id}`, data: x.data, item: x.item, valor: x.valor, cat: x.cat, entrada: x.entrada
  }))
  return [...locais, ...publicadas].sort((a, b) => b.data.localeCompare(a.data))
}

export const ehLocal = (t: Transacao): boolean => t.chave.startsWith('local#')

/** Guarda um movimento do porquinho: positivo guarda, negativo tira. */
export function guardarMovimento(g: Guardado, saldoPublicado: number, valor: number, agora = Date.now()): void {
  const d = ler(g)
  const vivos = d.cofre.filter(m => agora - m.criadoEm < VALIDADE_MS)
  const esperado = saldoPublicado + vivos.reduce((s, m) => s + m.valor, 0)
  vivos.push({ valor, base: esperado, criadoEm: agora })
  gravar(g, { ...d, cofre: vivos })
}

const igual = (a: number, b: number): boolean => Math.abs(a - b) < 0.005

/** O saldo que a tela deve mostrar: o publicado mais o que ainda está a caminho. */
export function saldoComMovimentos(g: Guardado, saldoPublicado: number, agora = Date.now()): number {
  const d = ler(g)
  let cofre = d.cofre.filter(m => agora - m.criadoEm < VALIDADE_MS)
  // O último movimento cuja conta bate com o publicado: ele e os de antes chegaram.
  let chegou = -1
  cofre.forEach((m, i) => { if (igual(saldoPublicado, m.base + m.valor)) chegou = i })
  if (chegou >= 0) cofre = cofre.slice(chegou + 1)
  if (cofre.length !== d.cofre.length) gravar(g, { ...d, cofre })
  const saldo = saldoPublicado + cofre.reduce((s, m) => s + m.valor, 0)
  return Math.round(saldo * 100) / 100
}
