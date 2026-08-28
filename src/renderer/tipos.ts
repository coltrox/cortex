import type { NoteRow } from '../shared/types'

/**
 * Uma nota com o frontmatter inteiro reidratado.
 *
 * O índice guarda cada chave de frontmatter na tabela `fields`, separando
 * número, data e texto. Valores aninhados — `gastos:`, `refeicoes:`,
 * `exercicios:` — são serializados como JSON e voltam a ser objeto aqui.
 *
 * Chega pelo canal `note:list-fields`.
 */
export type NoteComCampos = NoteRow & { campos: Record<string, unknown> }

/** Data de hoje em ISO `YYYY-MM-DD`, no fuso local — não em UTC. */
export function hojeISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}
