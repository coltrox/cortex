/**
 * As regras do rascunho — a folha de conta que abre dentro do exercício.
 *
 * O pedido: "os exercícios que tiver fazer conta, uma área para desenhar e
 * fazer conta, que eu consigo escrever, apagar, com a caneta mesmo do
 * tablet". Ou seja, o papel de rascunho que ele usaria ao lado da prova,
 * dentro do app.
 *
 * O que está aqui é só o que dá para errar em silêncio: a espessura do traço
 * e a decisão de ignorar o toque da palma da mão. O desenho em si é canvas, e
 * canvas não se testa sem navegador.
 */

export type Ferramenta = 'caneta' | 'borracha'

/** Espessura do traço, em pixels de CSS. */
export const TRACO_BASE = 2.2
export const TRACO_BORRACHA = 22

/**
 * A espessura de um traço, dada a pressão da caneta.
 *
 * A caneta do tablet reporta pressão de 0 a 1; mouse e dedo reportam 0,5 fixo
 * — ou 0, em alguns navegadores. Por isso o piso: pressão 0 não pode virar
 * traço invisível.
 *
 * A borracha tem espessura fixa. Apagar com pressão variável deixaria buracos
 * de tamanhos diferentes e exigiria passar várias vezes no mesmo lugar.
 */
export function espessura(pressao: number, ferramenta: Ferramenta): number {
  if (ferramenta === 'borracha') return TRACO_BORRACHA
  const p = Number.isFinite(pressao) && pressao > 0 ? Math.min(pressao, 1) : 0.5
  // De 60% a 180% da base: fino o bastante para caber conta, grosso o
  // bastante para a pressão ser perceptível.
  return TRACO_BASE * (0.6 + p * 1.2)
}

/**
 * Este ponteiro deve desenhar?
 *
 * Rejeição de palma, a regra que faz o rascunho ser usável no tablet: assim
 * que uma CANETA encosta na tela, o toque do dedo — e da mão apoiada — para
 * de desenhar. Sem isso, apoiar a mão para escrever risca a folha inteira.
 *
 * Enquanto nenhuma caneta apareceu, o dedo desenha normalmente: quem usa só o
 * celular não fica sem rascunho.
 */
export function deveDesenhar(tipo: string, jaUsouCaneta: boolean): boolean {
  if (tipo === 'touch') return !jaUsouCaneta
  return true
}

/**
 * O tamanho do bitmap do canvas, para o traço não sair borrado.
 *
 * O canvas tem duas medidas: a da tela (CSS) e a do bitmap. Num tablet de
 * alta densidade elas diferem por 2 ou 3 vezes, e desenhar no bitmap pequeno
 * e esticar é o que deixa a linha serrilhada.
 *
 * O teto de 3 existe porque acima disso a memória cresce ao quadrado sem
 * diferença visível.
 */
export function tamanhoDoBitmap(
  larguraCss: number, alturaCss: number, densidade: number
): { largura: number; altura: number; escala: number } {
  const escala = Math.min(Math.max(Number.isFinite(densidade) ? densidade : 1, 1), 3)
  return {
    largura: Math.max(1, Math.round(larguraCss * escala)),
    altura: Math.max(1, Math.round(alturaCss * escala)),
    escala
  }
}
