import { txt, lista } from '../dados'

/**
 * O treino registrado, lido da nota para virar tela.
 *
 * A nota `tipo: sessao` guarda cada exercício com as séries que saíram
 * (`feitas: [{ carga, reps }]`) mais um resumo (`series`, `reps`, `carga`).
 * Até aqui a nota aberta desenhava isso com o desenhador genérico de campos,
 * que enfileira todos os valores de uma lista de objetos: "Puxada alta
 * fechada · 47-68 · 12 · 47 · 12 · 61 · 10 · 68 · 8 · 3". Dá para adivinhar o
 * treino ali dentro, mas ninguém deveria precisar.
 *
 * Aqui os números voltam a ser o que são: séries de peso × repetições, com o
 * volume (peso × reps somado) — que é o número que diz se a semana rendeu.
 */

export type SerieLida = { carga: number | null; reps: number | null }

export type ExercicioLido = {
  nome: string
  series: SerieLida[]
  /** Quantas séries, contando o resumo quando a nota não guardou as séries. */
  quantas: number
  /** A maior carga da sessão. */
  carga: number | null
  /** As repetições que saíram: "15" ou "8-12". */
  reps: string
  /** Peso × repetições somado, quando dá para calcular. */
  volume: number | null
}

export type TreinoLido = {
  modelo: string
  exercicios: ExercicioLido[]
  totalSeries: number
  volume: number | null
}

/**
 * Número, ou `null` quando o campo não foi preenchido.
 *
 * Não usa o `num()` de `dados.ts` de propósito: aquele devolve 0 para campo
 * ausente, e aqui a diferença importa — série em branco não é série de zero
 * quilo, e um cardio sem distância não percorreu 0 km.
 */
const numeroOuNulo = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** As séries de um exercício. Nota antiga, sem `feitas`, devolve lista vazia. */
function seriesDe(e: Record<string, unknown>): SerieLida[] {
  return lista(e.feitas)
    .map(s => ({ carga: numeroOuNulo(s.carga), reps: numeroOuNulo(s.reps) }))
    .filter(s => s.carga !== null || s.reps !== null)
}

/** A faixa de repetições: tudo igual vira um número só. */
function faixaDeReps(series: SerieLida[], resumo: unknown): string {
  const reps = series.map(s => s.reps).filter((r): r is number => r !== null)
  if (reps.length === 0) return txt(resumo)
  const min = Math.min(...reps)
  const max = Math.max(...reps)
  return min === max ? String(min) : `${min}-${max}`
}

export function lerTreino(campos: Record<string, unknown>): TreinoLido {
  const exercicios: ExercicioLido[] = []
  for (const e of lista(campos.exercicios)) {
    const nome = txt(e.nome)
    if (!nome) continue
    const series = seriesDe(e)
    const cargas = series.map(s => s.carga).filter((c): c is number => c !== null)
    const comOsDois = series.filter(s => s.carga !== null && s.reps !== null)
    exercicios.push({
      nome,
      series,
      quantas: series.length || numeroOuNulo(e.series) || 0,
      carga: cargas.length ? Math.max(...cargas) : numeroOuNulo(e.carga),
      reps: faixaDeReps(series, e.reps),
      // Só soma o que tem peso E repetição: meia série contada viraria um
      // volume menor que o real, e um número mentindo é pior que nenhum.
      volume: comOsDois.length
        ? comOsDois.reduce((s, x) => s + (x.carga as number) * (x.reps as number), 0)
        : null
    })
  }
  const volumes = exercicios.map(e => e.volume).filter((v): v is number => v !== null)
  return {
    modelo: txt(campos.modelo),
    exercicios,
    totalSeries: exercicios.reduce((s, e) => s + e.quantas, 0),
    volume: volumes.length ? volumes.reduce((s, v) => s + v, 0) : null
  }
}

export type CardioLido = {
  aparelho: string
  minutos: number | null
  distancia: number | null
  pace: string
  nivel: number | null
}

export function lerCardio(campos: Record<string, unknown>): CardioLido {
  return {
    aparelho: txt(campos.aparelho) || 'cardio',
    minutos: numeroOuNulo(campos.minutos),
    distancia: numeroOuNulo(campos.distancia),
    pace: txt(campos.pace),
    nivel: numeroOuNulo(campos.nivel)
  }
}

/** "8.850" — o volume com ponto de milhar, que é onde ele fica legível. */
export const comMilhar = (n: number): string => n.toLocaleString('pt-BR')

/** 20 vira "20 min"; 90 vira "1 h 30 min". */
export function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
