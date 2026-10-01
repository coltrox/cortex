/**
 * Mudar a ordem de uma lista arrastando.
 *
 * A conta fica aqui, separada da tela, porque é a parte que erra em silêncio:
 * soltar um item uma posição acima do lugar certo não quebra nada, só deixa o
 * treino numa ordem que ninguém pediu. Com teste, isso aparece.
 */

/** A lista com o item de `de` reposto em `para`. Índice fora da lista não mexe em nada. */
export function mover<T>(lista: T[], de: number, para: number): T[] {
  if (de === para) return lista
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return lista
  const out = [...lista]
  const [item] = out.splice(de, 1)
  out.splice(para, 0, item)
  return out
}

/** Onde cada item está na tela: o topo e a altura, na ordem da lista. */
export type Caixa = { topo: number; altura: number }

/**
 * Sobre qual posição o dedo está.
 *
 * Compara com o MEIO de cada item: o item só cede o lugar quando o dedo passa
 * da metade dele, que é o instante em que a troca parece certa para quem
 * arrasta. Acima do primeiro vira 0; abaixo do último, o fim da lista.
 */
export function alvoDoArrasto(y: number, caixas: Caixa[]): number {
  if (caixas.length === 0) return 0
  for (let i = 0; i < caixas.length; i++) {
    const meio = caixas[i].topo + caixas[i].altura / 2
    if (y < meio) return i
  }
  return caixas.length - 1
}
