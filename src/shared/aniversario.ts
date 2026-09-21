/**
 * O aniversário de uma pessoa vai para o calendário?
 *
 * A ficha da pessoa tem a caixinha "Marcar o aniversário no calendário".
 * Marcada por padrão — e quem foi cadastrado antes dela existir não tem o
 * campo, e continua aparecendo como sempre apareceu. Só o `false` explícito
 * (a caixinha desmarcada) tira o aniversário do calendário do Cortex e do
 * Google.
 */
export const CAMPO_ANIVERSARIO = 'aniversario_no_calendario'

export function aniversarioNoCalendario(campos: Record<string, unknown>): boolean {
  return campos[CAMPO_ANIVERSARIO] !== false
}
