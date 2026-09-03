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
  'sessao', 'cardio', 'medida', 'peso', 'anotacao',
  // Agenda e estudos: os três que mexem numa nota que já existe, ou criam
  // uma. Os de cima só acrescentam ao diário do dia.
  'prova_estudada', 'compromisso', 'item_apagado', 'compromisso_editado',
  // Marcar do celular o que antes so nascia no Cortex.
  'prova_nova', 'tarefa_nova',
  // Porquinho: guardar e tirar. Movimento, nao saldo -- o saldo e a soma dos
  // movimentos, e quem faz essa conta e o Cortex.
  'porquinho'
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

/**
 * As espécies que o Cortex publica.
 *
 * `treino`, `suplemento` e `refeicao` são catálogo: o que existe, nunca o
 * que foi feito. `prova`, `compromisso` e `tarefa` são o que está chegando
 * — o celular precisa vê-los para poder marcar, cancelar ou dizer que
 * estudou.
 *
 * Nada de Vida entra aqui. Documentos, senhas e contas ficam no computador,
 * e `cardapio.test.ts` falha se algum deles aparecer no que sobe.
 */
/**
 * Os tipos de NOTA que alimentam o cardápio.
 *
 * Diferente de `ESPECIES_CARDAPIO`, que é o que sai publicado: aqui é o que o
 * Cortex lê do vault para montar aquilo. Mora no contrato compartilhado
 * porque três lugares precisam concordar, e já divergiram uma vez —
 * `App.tsx` observava só três destes tipos, e o resultado era que criar uma
 * prova ou um compromisso no Cortex não republicava nada: o celular só via a
 * novidade quando, por acaso, um treino fosse editado depois.
 */
export const TIPOS_NOTA_CARDAPIO = [
  'treino-modelo', 'suplemento', 'plano', 'prova', 'simulado', 'evento', 'tarefa',
  // Os dois do porquinho: os movimentos, para somar o saldo, e a meta ativa.
  'porquinho', 'meta-cofre',
  // O diário do dia, e SÓ para saber o que já foi marcado hoje: sem ele o
  // celular não teria como saber que um suplemento foi desmarcado aqui no
  // Cortex, porque o check dele vivia apenas na memória do próprio aparelho.
  // `montarCardapio` copia dele dois campos, nada mais — ver a lista branca
  // lá, que é o que impede o resto do diário (gastos, anotações do dia) de
  // subir junto.
  'diario'
] as const

export const ESPECIES_CARDAPIO = [
  'treino', 'suplemento', 'refeicao', 'prova', 'compromisso', 'tarefa', 'porquinho'
] as const

export type EspecieCardapio = (typeof ESPECIES_CARDAPIO)[number]

/** Um item do cardápio. `detalhe.path` é como o celular devolve a referência. */
export type ItemCardapio = {
  especie: EspecieCardapio
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
