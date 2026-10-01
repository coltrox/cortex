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
 * Em qual FENDA o dedo está — o espaço ENTRE dois itens.
 *
 * Fenda, e não "sobre qual item": o exercício cai no meio de outros dois, e
 * não por cima de um (pedido do dono). Numa lista de quatro há cinco fendas,
 * de 0 (antes do primeiro) a 4 (depois do último) — é esse número que a tela
 * desenha como o espaço aberto esperando o cartão.
 */
export function fendaDoArrasto(y: number, caixas: Caixa[]): number {
  for (let i = 0; i < caixas.length; i++) {
    const meio = caixas[i].topo + caixas[i].altura / 2
    if (y < meio) return i
  }
  return caixas.length
}

/**
 * A lista com o item de `de` solto na fenda `fenda`.
 *
 * Tirar o item antes de recolocá-lo desloca tudo que vem depois dele: soltar
 * na fenda 3 quem saiu da posição 1 é parar na posição 2. É a conta que erra
 * quando feita de cabeça na hora de desenhar a tela.
 */
export function moverParaFenda<T>(lista: T[], de: number, fenda: number): T[] {
  if (de < 0 || de >= lista.length) return lista
  const destino = fenda > de ? fenda - 1 : fenda
  return mover(lista, de, Math.min(Math.max(destino, 0), lista.length - 1))
}
