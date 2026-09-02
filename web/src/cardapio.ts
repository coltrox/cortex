import { ESPECIES_CARDAPIO, type ItemCardapio } from '@compartilhado/eventos'
import type { Guardado } from './guardado'

const CHAVE = 'cortex.cardapio'

// Vem do contrato compartilhado, e nao de uma copia local. Havia tres listas
// iguais deste conjunto -- aqui, em nuvem.ts e no schema.sql -- e acrescentar
// uma especie nova sem lembrar das tres a fazia sumir em silencio no meio do
// caminho. Foi exatamente o que aconteceu com prova/compromisso/tarefa.
const ESPECIES = ESPECIES_CARDAPIO

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
  // Na ordem do dia, nao na ordem em que o banco devolveu: o almoco aparecer
  // antes do cafe faz a pessoa procurar na lista o que deveria estar na
  // frente dela. `HH:MM` ordena igual em texto e no relogio.
  //
  // Refeicao sem hora vai para o fim, e nao para o comeco: sem hora marcada
  // ela e o extra, nao a primeira do dia.
  return c.itens
    .filter(i => i.especie === 'refeicao')
    .sort((x, y) => {
      const a = typeof x.detalhe.hora === 'string' && x.detalhe.hora !== '' ? x.detalhe.hora : '99:99'
      const b = typeof y.detalhe.hora === 'string' && y.detalhe.hora !== '' ? y.detalhe.hora : '99:99'
      return a < b ? -1 : a > b ? 1 : x.nome.localeCompare(y.nome)
    })
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

export function provas(c: Cardapio): ItemCardapio[] {
  return porData(c.itens.filter(i => i.especie === 'prova'), 'data')
}

export function compromissos(c: Cardapio): ItemCardapio[] {
  return porData(c.itens.filter(i => i.especie === 'compromisso'), 'data')
}

export function tarefas(c: Cardapio): ItemCardapio[] {
  return porData(c.itens.filter(i => i.especie === 'tarefa'), 'prazo')
}

/**
 * Ordena pela data, como texto.
 *
 * `YYYY-MM-DD` ordena igual em texto e no tempo, então não é preciso
 * construir um Date por item só para comparar — e construir Date a partir de
 * texto é justamente onde o fuso costuma entrar sem ser convidado.
 */
function porData(itens: ItemCardapio[], campo: string): ItemCardapio[] {
  return [...itens].sort((a, b) => {
    const x = typeof a.detalhe[campo] === 'string' ? (a.detalhe[campo] as string) : '9999'
    const y = typeof b.detalhe[campo] === 'string' ? (b.detalhe[campo] as string) : '9999'
    return x < y ? -1 : x > y ? 1 : a.nome.localeCompare(b.nome)
  })
}

/** O caminho da nota, que é como o celular devolve a referência ao Cortex. */
export function caminhoDe(i: ItemCardapio): string {
  return typeof i.detalhe.path === 'string' ? i.detalhe.path : ''
}

/** A data de um item, seja ela `data` (prova, compromisso) ou `prazo` (tarefa). */
export function dataDe(i: ItemCardapio): string {
  const v = i.detalhe.data ?? i.detalhe.prazo
  return typeof v === 'string' ? v : ''
}

/**
 * Quantos dias faltam, em texto curto para caber no celular.
 *
 * Faz a conta em dias de calendário, não em milissegundos: com milissegundos,
 * uma prova às 8h de amanhã "falta 0 dias" às 23h de hoje, e a tela mentiria.
 */
export function faltam(data: string, hoje: string): string {
  if (!data) return ''
  const dias = Math.round(
    (Date.parse(`${data}T00:00:00`) - Date.parse(`${hoje}T00:00:00`)) / 86_400_000
  )
  if (Number.isNaN(dias)) return ''
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`
}

export type Porquinho = { nome: string; saldo: number; alvo: number | null; ate: string | null }

/**
 * O porquinho, quando o Cortex publicou um.
 *
 * O saldo vem somado de lá: o celular não recebe os movimentos, só o total.
 */
export function porquinho(c: Cardapio): Porquinho | null {
  const i = c.itens.find(x => x.especie === 'porquinho')
  if (!i) return null
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    nome: i.nome,
    saldo: n(i.detalhe.saldo) ?? 0,
    alvo: n(i.detalhe.alvo),
    ate: typeof i.detalhe.ate === 'string' ? i.detalhe.ate : null
  }
}

/** Dinheiro em português, com o símbolo e duas casas. */
export function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
