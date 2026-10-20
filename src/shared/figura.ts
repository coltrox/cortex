/**
 * A figura da questão — o desenho de geometria, o gráfico.
 *
 * Pedido dele: "questões que aparecem em figuras, de geometria, até de
 * gráfico também, geometria analítica". Sem desenho, metade da matemática de
 * prova não existe: não dá para pedir o x do vértice sem a parábola, nem a
 * lei dos cossenos sem o triângulo.
 *
 * A figura é **SVG escrito no vault**, e não um arquivo de imagem, por dois
 * motivos: anexo não sobe para a nuvem (decisão antiga do dono), e SVG é
 * texto — cabe no frontmatter da questão e viaja junto dela até o celular.
 *
 * O preço disso é que um SVG entra no DOM como markup. Por isso este módulo
 * existe, e por isso ele **recusa em vez de limpar**: o que não for
 * reconhecido inteiro, elemento por elemento e atributo por atributo, volta
 * como `null` e a questão aparece sem figura. Tentar higienizar markup
 * desconhecido é adivinhar o que o autor quis dizer — e aqui errar significa
 * executar código no aparelho dele.
 */

/** Tamanho máximo, em caracteres. Desenho de questão não passa nem perto. */
const TETO = 8000

/**
 * Os elementos que uma figura de geometria precisa — e só eles.
 *
 * Nada de `image`, `use`, `a` ou `foreignObject`: os quatro carregam conteúdo
 * de fora, que é justamente o que não pode acontecer aqui.
 */
const TAGS = new Set([
  'svg', 'g', 'defs', 'marker', 'title',
  'line', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'path',
  'text', 'tspan'
])

/**
 * Os atributos permitidos.
 *
 * `style` fica de fora de propósito: ele aceita `url(...)`, e com isso
 * reabriria a porta que a lista de tags fechou. Cor, traço e tamanho têm
 * atributo próprio aqui, então nada se perde no desenho.
 */
const ATRIBUTOS = new Set([
  'viewbox', 'width', 'height', 'xmlns',
  'x', 'y', 'dx', 'dy', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-size', 'font-family', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'letter-spacing',
  'marker-end', 'marker-start', 'markerwidth', 'markerheight',
  'refx', 'refy', 'orient', 'markerunits',
  'id', 'class', 'role', 'aria-hidden'
])

/** O que, se aparecer, condena a figura inteira na hora. */
const PROIBIDO = /<\s*(script|style|foreignobject|image|use|a|iframe|object|embed|animate|set)\b|<!--|<!\[CDATA\[|javascript:|data:|&#/i

/**
 * Devolve o SVG se ele for seguro de renderizar, ou `null`.
 *
 * `null` não é erro: é uma questão sem figura, que continua respondível pelo
 * enunciado. Entre mostrar um desenho e injetar algo que ninguém revisou, a
 * escolha é fácil.
 */
export function figuraSegura(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  const svg = bruto.trim()
  if (svg.length === 0 || svg.length > TETO) return null

  // Tem de ser um SVG inteiro, e um só: um `</svg>` no meio abriria espaço
  // para markup solto depois dele.
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) return null
  if ((svg.match(/<svg[\s>]/gi) ?? []).length !== 1) return null

  if (PROIBIDO.test(svg)) return null

  // Todo nome de tag que aparece precisa estar na lista.
  for (const achado of svg.matchAll(/<\s*\/?\s*([a-zA-Z][\w:-]*)/g)) {
    const tag = (achado[1] ?? '').toLowerCase()
    if (!TAGS.has(tag)) return null
  }

  // E todo atributo também. Isto é o que barra `onload=`, `href=` e
  // `xlink:href=` sem precisar listá-los um a um.
  for (const achado of svg.matchAll(/[\s"']([a-zA-Z][\w:.-]*)\s*=/g)) {
    const atributo = (achado[1] ?? '').toLowerCase()
    if (!ATRIBUTOS.has(atributo)) return null
  }

  return svg
}
