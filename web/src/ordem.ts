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
 * não por cima de um (pedido do dono).
 *
 * As caixas aqui são as dos itens QUE FICARAM, sem o que está na mão. Isso
 * importa: o cartão arrastado anda com o dedo, e enquanto ele estava na conta
 * a caixa dele viajava junto — descendo, o dedo nunca passava do meio de
 * ninguém, e o exercício só sabia subir. Numa lista de quatro, tirando o
 * arrastado sobram três itens e quatro fendas: de 0 (antes de todos) a 3.
 */
export function fendaDoArrasto(y: number, caixas: Caixa[]): number {
  for (let i = 0; i < caixas.length; i++) {
    const meio = caixas[i].topo + caixas[i].altura / 2
    if (y < meio) return i
  }
  return caixas.length
}

/**
 * A lista com o item de `de` solto na posição `posicao`.
 *
 * `posicao` é contada na lista SEM o item — é o que a fenda devolve, e é o
 * que o `splice` espera depois de tirá-lo. Assim não existe a conta de
 * "desconta um se for para baixo", que é onde esse tipo de lista erra em
 * silêncio. Devolve a MESMA lista quando nada mudou de lugar.
 */
export function soltarEm<T>(lista: T[], de: number, posicao: number): T[] {
  if (de < 0 || de >= lista.length) return lista
  const out = [...lista]
  const [item] = out.splice(de, 1)
  out.splice(Math.min(Math.max(posicao, 0), out.length), 0, item)
  return out.every((x, i) => x === lista[i]) ? lista : out
}
