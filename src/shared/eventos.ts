import { z } from 'zod'

/**
 * O contrato entre o celular e o Cortex.
 *
 * Vive em `shared/` porque os dois lados dependem dele: mudar um campo aqui
 * quebra a compilação do desktop E do app web, que é exatamente o que se quer
 * — a alternativa é os dois divergirem em silêncio e o dado chegar torto.
 */

export const TIPOS_EVENTO = [
  'suplemento', 'refeicao_plano', 'refeicao_extra', 'gasto',
  'sessao', 'cardio', 'medida', 'peso', 'anotacao'
] as const

export type TipoEvento = (typeof TIPOS_EVENTO)[number]

/** Data no fuso local, nunca `toISOString()` (que vira o dia seguinte à noite). */
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dia deve ser ISO YYYY-MM-DD')

export const EVENTO_SCHEMA = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  dia: DIA,
  dados: z.record(z.string().max(64), z.unknown())
}).strict()

export type Evento = z.infer<typeof EVENTO_SCHEMA>

/** Um item do cardápio: o que existe, nunca o que foi feito. */
export type ItemCardapio = {
  especie: 'treino' | 'suplemento' | 'refeicao'
  nome: string
  detalhe: Record<string, unknown>
}

const LIMITE_DADOS = 8 * 1024

export function validarEvento(bruto: unknown): Evento {
  const r = EVENTO_SCHEMA.safeParse(bruto)
  if (!r.success) throw new Error(`evento inválido: ${r.error.message}`)
  // O mesmo teto que a função no banco aplica. Checar dos dois lados evita
  // que um app desatualizado descubra o limite só quando o INSERT falha.
  //
  // Conta code points (`[...texto].length`), não unidades UTF-16 (`.length`):
  // é isso que o Postgres mede em `length(p_dados::text)`. Para qualquer
  // caractere fora do BMP (emoji, por exemplo) o JS enxerga 2 unidades onde
  // o Postgres enxerga 1 caractere — contar `.length` tornaria o cliente
  // mais restritivo que o banco e rejeitaria por engano algo que o banco
  // aceitaria.
  const texto = JSON.stringify(r.data.dados)
  if ([...texto].length > LIMITE_DADOS) {
    throw new Error('dados do evento grande demais (máx. 8 KB)')
  }
  return r.data
}
