import type { NoteComCampos } from '../tipos'
import { aniversarioNoCalendario } from '../../shared/aniversario'

/**
 * Os compromissos repetidos do calendário.
 *
 * Nasceu de um pedido do dono: com a agenda do Google entrando no Cortex, o
 * mesmo compromisso pode chegar duas vezes — um criado aqui e outro puxado de
 * lá, ou o mesmo evento em dois calendários da conta.
 *
 * Duas notas são o mesmo compromisso quando caem no mesmo dia com o mesmo
 * título, sem contar maiúsculas, acentos, pontuação, o "Prova:" que o Google
 * mostra e o "Aniversário de" do aniversário. Hora só separa quando as duas
 * têm hora e ela é diferente: "Dentista 09:00" e "Dentista 15:00" são duas
 * consultas; "Dentista" e "Dentista 09:00" são uma só, uma delas sem a hora.
 *
 * O que se repete todo ano (data comemorativa e aniversário de pessoa) é
 * comparado pelo dia e mês, não por uma data.
 */

export type GrupoRepetido = {
  /** `AAAA-MM-DD`, ou `--MM-DD` para o que cai todo ano. */
  quando: string
  titulo: string
  notas: NoteComCampos[]
}

const DATADOS = new Set(['evento', 'prova', 'simulado', 'tarefa', 'acontecimento'])

/** O título reduzido ao que importa para comparar. */
export function tituloComparavel(t: string): string {
  return t
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*prova\s*:\s*/, '')
    .replace(/^\s*aniversario\s+(de|da|do|das|dos)\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const dois = (n: number): string => String(n).padStart(2, '0')

/** Quando a nota cai no calendário, e com que título ela aparece lá. `null`: não aparece. */
function noCalendario(n: NoteComCampos): { quando: string; titulo: string } | null {
  if (n.campos.cancelado === true) return null
  if (n.tipo === 'data-comemorativa' || n.tipo === 'pessoa') {
    if (n.tipo === 'pessoa' && !aniversarioNoCalendario(n.campos)) return null
    const [d, m] = n.tipo === 'pessoa'
      ? [n.campos.nascimento_dia, n.campos.nascimento_mes]
      : [n.campos.dia, n.campos.mes]
    const dia = Number(d)
    const mes = Number(m)
    if (!Number.isInteger(dia) || !Number.isInteger(mes) || dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
    return { quando: `--${dois(mes)}-${dois(dia)}`, titulo: n.tipo === 'pessoa' ? `Aniversário de ${n.title}` : n.title }
  }
  if (!DATADOS.has(n.tipo) || !n.date) return null
  return { quando: n.date, titulo: n.title }
}

const horaDe = (n: NoteComCampos): string | null =>
  typeof n.campos.hora === 'string' && n.campos.hora.trim() ? n.campos.hora.trim() : null

export function repetidos(notas: NoteComCampos[]): GrupoRepetido[] {
  const grupos = new Map<string, GrupoRepetido>()
  for (const n of notas) {
    const c = noCalendario(n)
    if (!c) continue
    const comparavel = tituloComparavel(c.titulo)
    if (!comparavel) continue
    const chave = `${c.quando}|${comparavel}`
    const g = grupos.get(chave)
    if (g) g.notas.push(n)
    else grupos.set(chave, { quando: c.quando, titulo: c.titulo, notas: [n] })
  }
  const out: GrupoRepetido[] = []
  for (const g of grupos.values()) {
    if (g.notas.length < 2) continue
    // Horas diferentes, as duas preenchidas: são compromissos diferentes.
    // Separa por hora; quem não tem hora fica com cada um deles.
    const horas = [...new Set(g.notas.map(horaDe).filter((h): h is string => h !== null))]
    if (horas.length <= 1) { out.push(g); continue }
    const semHora = g.notas.filter(n => horaDe(n) === null)
    for (const h of horas) {
      const juntos = [...g.notas.filter(n => horaDe(n) === h), ...semHora]
      if (juntos.length >= 2) out.push({ ...g, notas: juntos })
    }
  }
  // O que está mais perto primeiro; o que se repete todo ano, no fim.
  const anual = (g: GrupoRepetido): number => (g.quando.startsWith('--') ? 1 : 0)
  return out.sort((a, b) => anual(a) - anual(b) || a.quando.localeCompare(b.quando) || a.titulo.localeCompare(b.titulo))
}

/**
 * As cópias que dá para apagar sem perguntar uma por uma: grupos em que todas
 * as notas vieram do Google (`origem: google`) com o mesmo título, dia, hora
 * e local. Fica uma de cada grupo — a de nome mais curto, a primeira criada
 * ("redação.md" e não "redação (15).md") — e o resto sai. Na próxima rodada
 * o Google religa a que ficou (ver `planejarImportacao`).
 *
 * Grupo com nota feita aqui no Cortex, ou com diferença em qualquer campo,
 * fica de fora: aí é o dono quem decide qual vale.
 */
export function copiasDoGoogle(grupos: GrupoRepetido[]): NoteComCampos[] {
  const assinatura = (n: NoteComCampos): string =>
    JSON.stringify([n.title.trim(), n.date, n.campos.hora ?? null, n.campos.local ?? null])
  const apagar = new Map<string, NoteComCampos>()
  for (const g of grupos) {
    if (!g.notas.every(n => n.tipo === 'evento' && n.campos.origem === 'google')) continue
    if (new Set(g.notas.map(assinatura)).size !== 1) continue
    const ordem = [...g.notas].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
    for (const n of ordem.slice(1)) apagar.set(n.path, n)
  }
  return [...apagar.values()]
}
