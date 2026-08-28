import type { ItemCardapio } from '@compartilhado/eventos'
import type { Guardado } from './guardado'

const CHAVE = 'cortex.cardapio'

const ESPECIES = ['treino', 'suplemento', 'refeicao'] as const

/**
 * Os ids de dia da semana do Cortex, na ordem de `Date.getDay()`.
 *
 * São exatamente os de `src/renderer/formularios.tsx` — sem acento em `sab`.
 * Divergir aqui faria o suplemento de sábado nunca aparecer.
 */
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

export type Cardapio = { itens: ItemCardapio[]; atualizadoEm: string | null }

const VAZIO: Cardapio = { itens: [], atualizadoEm: null }

/**
 * O cardápio fica guardado no aparelho.
 *
 * Não é cache por desempenho: é o que faz o app abrir com os suplementos e as
 * refeições do dia mesmo sem sinal, que é metade do motivo de ele existir.
 */
export function lerCardapio(g: Guardado): Cardapio {
  const bruto = g.ler(CHAVE)
  if (!bruto) return VAZIO
  let cru: unknown
  try {
    cru = JSON.parse(bruto)
  } catch {
    return VAZIO
  }
  if (!cru || typeof cru !== 'object') return VAZIO
  const o = cru as Record<string, unknown>

  const itens: ItemCardapio[] = []
  for (const linha of Array.isArray(o.itens) ? o.itens : []) {
    if (!linha || typeof linha !== 'object') continue
    const l = linha as Record<string, unknown>
    const especie = ESPECIES.find(e => e === l.especie)
    if (!especie || typeof l.nome !== 'string') continue
    itens.push({
      especie,
      nome: l.nome,
      detalhe: l.detalhe && typeof l.detalhe === 'object' && !Array.isArray(l.detalhe)
        ? (l.detalhe as Record<string, unknown>)
        : {}
    })
  }
  return { itens, atualizadoEm: typeof o.atualizadoEm === 'string' ? o.atualizadoEm : null }
}

export function gravarCardapio(g: Guardado, itens: ItemCardapio[], quando: string): void {
  g.gravar(CHAVE, JSON.stringify({ itens, atualizadoEm: quando }))
}

/** O dia da semana de uma data ISO, no vocabulário do Cortex. */
export function diaDaSemana(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  return SEMANA[new Date(a, m - 1, d).getDay()]
}

export function suplementosDoDia(c: Cardapio, dia: string): ItemCardapio[] {
  const hoje = diaDaSemana(dia)
  return c.itens.filter(i => {
    if (i.especie !== 'suplemento') return false
    const dias = i.detalhe.dias
    // Sem lista de dias significa "todo dia". É o que o Cortex publica para um
    // suplemento cadastrado sem marcar dia nenhum, e o padrão útil.
    if (!Array.isArray(dias) || dias.length === 0) return true
    return dias.some(d => String(d) === hoje)
  })
}

export function refeicoesDoPlano(c: Cardapio): ItemCardapio[] {
  return c.itens.filter(i => i.especie === 'refeicao')
}

export function treinos(c: Cardapio): ItemCardapio[] {
  return c.itens.filter(i => i.especie === 'treino')
}

export type ExercicioDoModelo = { nome: string; series?: number; reps?: string }

export function exerciciosDoTreino(t: ItemCardapio): ExercicioDoModelo[] {
  const cru = t.detalhe.exercicios
  if (!Array.isArray(cru)) return []
  const out: ExercicioDoModelo[] = []
  for (const e of cru) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    if (typeof o.nome !== 'string' || o.nome === '') continue
    const item: ExercicioDoModelo = { nome: o.nome }
    if (typeof o.series === 'number') item.series = o.series
    if (typeof o.reps === 'string') item.reps = o.reps
    out.push(item)
  }
  return out
}
