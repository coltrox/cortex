/**
 * Sanitizadores compartilhados por quem lê dado hostil vindo de fora do
 * processo principal — evento do celular (`planejar.ts`) e frontmatter do
 * vault (`cardapio.ts`). As duas pontas recebem `Record<string, unknown>`
 * sem garantia nenhuma de forma, e as duas precisam da MESMA dureza.
 *
 * Esta guarda nasceu em `cardapio.ts` depois de três rodadas de revisão para
 * descobrir que `String(v)` de um array junta os elementos com vírgula
 * (recursivamente) — um array escapa junto sem que ninguém peça. `planejar.ts`
 * tinha uma cópia sem a guarda porque cada revisão via seu arquivo isolado;
 * daqui para frente há uma definição só, então divergir exige mexer aqui.
 */

// Só escalar vira texto — `String(v)` de um array junta os elementos com
// vírgula (recursivamente), então um array escapa junto sem que ninguém peça.
export const txt = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''

/** Só número de verdade sobe — um objeto disfarçado de kcal não é escalar. */
export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

export const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(i => i && typeof i === 'object') as Record<string, unknown>[] : []

/** Lista de strings simples — um dia da semana é 'seg', nunca um objeto com motivo anexado. */
export const listaDeTexto = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** Copia só as chaves que têm valor — evita `pace: ""`/chave vazia sujando o resultado. */
export function comValor(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}
