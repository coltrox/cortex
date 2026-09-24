/**
 * O que uma refeição do plano diz, quebrado em pedaços legíveis.
 *
 * Uma conduta de nutricionista não é uma lista de ingredientes: é um parágrafo
 * com alternativas ("2 ovos mexidos OU 30 g de whey"), às vezes numeradas
 * ("Só UMA destas: (1) … ; (2) …"). Na tela isso vinha como uma linha só,
 * cortada com reticências — dava para ver o começo do almoço e mais nada.
 *
 * Aqui o texto vira uma lista de opções. Quem monta a tela desenha cada uma
 * numa linha, com o "ou" no meio; nada é reescrito, só separado.
 */

export type ParteDaRefeicao = {
  /** O texto da opção, sem o "(1)" nem o "OU" que a separava. */
  texto: string
  /** O que vem antes da primeira opção: "Só UMA destas:". */
  intro?: string
}

/** Tira o "(1) " do começo e as sobras de pontuação das pontas. */
const limpar = (s: string): string =>
  s.replace(/^\s*\(\d+\)\s*/, '').replace(/^[;,\s]+|[;,\s]+$/g, '').trim()

/**
 * As opções de uma refeição.
 *
 * Separa por `OU` (maiúsculo, como a nutricionista escreve) e por números
 * entre parênteses. Texto sem nenhuma das duas marcas volta inteiro, numa
 * opção só — o normal de quem escreve "2 ovos e café".
 */
export function opcoesDaRefeicao(itens: string): ParteDaRefeicao[] {
  const bruto = (itens ?? '').trim()
  if (!bruto) return []

  /*
   * "Só UMA destas: (1) …", "300 ml de água com creatina. Depois: ovos OU whey"
   * — o que vem antes dos dois-pontos é recado ou parte fixa da refeição, e
   * não uma das alternativas. Vira introdução, acima das opções.
   *
   * O corte é nos dois-pontos, e só quando há alternativa depois dele: é a
   * marca que quem escreve usa para dizer "agora vêm as escolhas", e não
   * adivinhação sobre o texto.
   */
  let intro: string | undefined
  let corpo = bruto
  const antes = bruto.match(/^([^]*?):\s+(?=\(\d+\)|[^]*?\bOU\b)/)
  if (antes && /\(\d+\)|\bOU\b/.test(bruto.slice(antes[0].length))) {
    intro = antes[1].trim()
    corpo = bruto.slice(antes[0].length)
  }

  const partes = corpo
    // `+` no grupo do OU: "pão OU OU banana" é um separador só, e não uma
    // opção vazia no meio.
    .split(/(?:\s*\bOU\b\s*)+|\s*;\s*(?=\(\d+\))/)
    .map(limpar)
    .filter(Boolean)

  if (partes.length === 0) return []
  return partes.map((texto, i) => (i === 0 && intro ? { texto, intro } : { texto }))
}

/** Só o começo, para quando o cartão está fechado. */
export function resumoDaRefeicao(itens: string, limite = 90): string {
  const partes = opcoesDaRefeicao(itens)
  if (partes.length === 0) return ''
  const primeira = partes[0].texto
  const cortado = primeira.length > limite ? `${primeira.slice(0, limite - 1).trimEnd()}…` : primeira
  const restantes = partes.length - 1
  if (restantes === 0) return cortado
  return `${cortado} · +${restantes} ${restantes === 1 ? 'opção' : 'opções'}`
}
