import matter from 'gray-matter'
import { parseFrontmatter } from '../parser/frontmatter'

/**
 * Aplica uma mescla rasa de `mudancas` sobre o frontmatter de `raw` e
 * reserializa, preservando o corpo byte a byte.
 *
 * Mescla rasa: uma chave enviada em `mudancas` substitui o valor inteiro no
 * frontmatter atual, inclusive quando o valor é um array (não há mesclagem
 * item a item). Um valor `null` remove a chave por completo.
 *
 * Se `raw` tiver YAML que `parseFrontmatter` não conseguiu entender
 * (`parseError` presente), lança em vez de reescrever: sobrescrever
 * frontmatter que o parser não interpretou destruiria o que estava lá sem
 * o autor nunca ter visto o que foi perdido.
 */
export function patchFrontmatter(
  raw: string,
  mudancas: Record<string, unknown>
): string {
  const { frontmatter, body, parseError } = parseFrontmatter(raw)
  if (parseError) {
    throw new Error(`não é possível aplicar patch: YAML inválido (${parseError})`)
  }

  const mesclado: Record<string, unknown> = { ...frontmatter }
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor === null) {
      delete mesclado[chave]
    } else {
      mesclado[chave] = valor
    }
  }

  return matter.stringify(body, mesclado)
}

/**
 * Acrescenta `item` ao array em `frontmatter[campo]`, criando a lista se o
 * campo ainda não existir ou não for um array. Devolve o `raw` reserializado
 * (corpo preservado, mesma garantia de `patchFrontmatter`) e o comprimento
 * final da lista.
 *
 * Mesmas regras de `patchFrontmatter` para YAML inválido: lança em vez de
 * reescrever.
 */
export function appendToFrontmatterList(
  raw: string,
  campo: string,
  item: Record<string, unknown>
): { raw: string; total: number } {
  const { frontmatter, body, parseError } = parseFrontmatter(raw)
  if (parseError) {
    throw new Error(`não é possível acrescentar: YAML inválido (${parseError})`)
  }

  const atual = frontmatter[campo]
  const lista = Array.isArray(atual) ? [...atual, item] : [item]
  const mesclado = { ...frontmatter, [campo]: lista }

  return { raw: matter.stringify(body, mesclado), total: lista.length }
}
