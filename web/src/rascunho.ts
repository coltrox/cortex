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

export type AcaoPonteiro = 'desenhar' | 'mover' | 'ignorar'

/**
 * O que este ponteiro faz: desenha, move a folha, ou nada.
 *
 * Esta é a regra inteira da rejeição de palma, num lugar só, porque ela tem
 * um caso que não é óbvio e que custou uma reclamação:
 *
 * - **Caneta sempre desenha.** É o instrumento de escrever.
 * - **Dedo, antes de qualquer caneta, desenha.** Quem está no celular não
 *   fica sem rascunho por não ter caneta.
 * - **Dedo, depois de a caneta aparecer, move a folha.** Um dedo arrasta,
 *   dois ampliam.
 * - **Dedo, enquanto a caneta está encostada, não faz nada.**
 *
 * O último é a correção do bug que o dono descreveu assim: "eu tô
 * escrevendo, não tá escrevendo exatamente onde eu tô escrevendo". Não era a
 * conta de coordenada — era a mão. Com a palma apoiada na tela, o dedo não
 * riscava (isso já funcionava), mas ARRASTAVA a folha: cada tremida da mão
 * empurrava o papel por baixo da ponta da caneta, e o traço saía deslocado do
 * lugar onde ele estava escrevendo. Papel de verdade não foge da mão, e
 * agora este também não.
 *
 * `mouse` desenha: no computador não há gesto de pinça, e arrastar a folha
 * com o mouse valeria menos do que poder rabiscar com ele.
 */
export function acaoDoPonteiro(
  tipo: string, jaUsouCaneta: boolean, canetaEncostada: boolean
): AcaoPonteiro {
  if (tipo !== 'touch') return 'desenhar'
  if (!jaUsouCaneta) return 'desenhar'
  return canetaEncostada ? 'ignorar' : 'mover'
}

/**
 * Teto de pixels do bitmap.
 *
 * A folha é grande de propósito — ele pediu espaço para "escrever bastante" —
 * e bitmap cresce ao QUADRADO: uma folha de 2000×1400 num tablet de
 * densidade 3 daria 25 milhões de pixels, uns 100 MB só de memória de
 * desenho, e o navegador do celular mata a aba antes disso.
 *
 * 16 milhões é o ponto onde ainda cabe com folga e o traço continua nítido —
 * e também é o que sai no PNG exportado.
 */
const TETO_DE_PIXELS = 16_000_000

/**
 * O tamanho do bitmap do canvas, para o traço não sair borrado.
 *
 * O canvas tem duas medidas: a da tela (CSS) e a do bitmap. Num tablet de
 * alta densidade elas diferem por 2 ou 3 vezes, e desenhar no bitmap pequeno
 * e esticar é o que deixa a linha serrilhada.
 *
 * O teto de densidade 3 existe porque acima disso a memória cresce sem
 * diferença visível; o de pixels, porque uma folha grande multiplica isso de
 * novo.
 */
export function tamanhoDoBitmap(
  larguraCss: number, alturaCss: number, densidade: number
): { largura: number; altura: number; escala: number } {
  const pedida = Math.min(Math.max(Number.isFinite(densidade) ? densidade : 1, 1), 3)
  const area = Math.max(1, larguraCss * alturaCss)
  /* Nunca abaixo de 1: um bitmap menor que a folha deixaria o traço borrado,
     que é justamente o que esta função existe para evitar. Prefiro gastar
     memória a entregar rascunho serrilhado. */
  const escala = Math.max(1, Math.min(pedida, Math.sqrt(TETO_DE_PIXELS / area)))
  return {
    // `floor`, e não `round`: arredondar as duas dimensões para cima estoura
    // o teto que a linha acima acabou de calcular.
    largura: Math.max(1, Math.floor(larguraCss * escala)),
    altura: Math.max(1, Math.floor(alturaCss * escala)),
    escala
  }
}

/**
 * Ampliar ou reduzir mantendo um ponto da tela parado.
 *
 * É a mesma âncora da pinça, mas para quem não tem dois dedos: os botões
 * `+`/`−` e a roda do mouse. Sem a âncora, ampliar jogaria a folha para um
 * canto e ele perderia de vista o que estava escrevendo.
 *
 * `centro` vem em coordenada da ÁREA — normalmente o meio dela.
 */
export function comZoom(
  v: Vista, fator: number, centro: { x: number; y: number }
): Vista {
  const escala = limitarEscala(v.escala * (Number.isFinite(fator) && fator > 0 ? fator : 1))
  // O ponto da folha que está sob o centro agora precisa continuar sob ele.
  const ancora = { x: (centro.x - v.x) / v.escala, y: (centro.y - v.y) / v.escala }
  return {
    escala,
    x: centro.x - ancora.x * escala,
    y: centro.y - ancora.y * escala
  }
}

/** O nome do arquivo exportado: `rascunho 2026-10-20 14h30.png`. */
export function nomeDoPng(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `rascunho ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    ` ${p(d.getHours())}h${p(d.getMinutes())}.png`
}

/* ---------- mover e ampliar a folha ---------- */

/**
 * Onde a folha está e quanto ela está ampliada.
 *
 * `x` e `y` são o canto da folha em pixels de tela; `escala` multiplica o
 * tamanho. É o mesmo par que o CSS aplica em `translate(...) scale(...)`.
 */
export type Vista = { x: number; y: number; escala: number }

export const VISTA_INICIAL: Vista = { x: 0, y: 0, escala: 1 }
export const ESCALA_MIN = 0.4
export const ESCALA_MAX = 5

export function limitarEscala(s: number): number {
  if (!Number.isFinite(s)) return 1
  return Math.min(Math.max(s, ESCALA_MIN), ESCALA_MAX)
}

/**
 * Ponto da TELA para ponto da FOLHA.
 *
 * É o que faz a caneta escrever exatamente onde a ponta encostou, com a folha
 * movida e ampliada.
 *
 * `folha` é o retângulo do **próprio canvas**, medido com
 * `getBoundingClientRect()`. Isso é deliberado, e é a correção de um bug que
 * o dono sentiu na mão: "não tá escrevendo exatamente onde eu tô escrevendo".
 *
 * A conta anterior refazia a transformação por fora — descontava a origem da
 * área e o deslocamento guardado na `Vista`. Só que o CSS ampliava a folha a
 * partir do **centro** (o padrão de `transform-origin`), enquanto a conta
 * supunha o **canto**. Com zoom, as duas discordavam, e o traço saía longe da
 * ponta da caneta.
 *
 * O retângulo do canvas já vem com translate e scale aplicados pelo
 * navegador. Então sobra uma conta só — "quanto andei da borda, em pixels de
 * folha" — e ela não pode discordar do CSS, porque é o CSS que a produz. De
 * graça, fica imune a padding, rolagem e mudança de layout.
 */
export function paraFolha(
  clienteX: number, clienteY: number,
  folha: { left: number; top: number },
  escala: number
): { x: number; y: number } {
  // Escala zero ou NaN viria de um `scale()` inválido e mandaria o traço para
  // o infinito; com 1, ao menos desenha no lugar certo em tamanho normal.
  const s = Number.isFinite(escala) && escala > 0 ? escala : 1
  return {
    x: (clienteX - folha.left) / s,
    y: (clienteY - folha.top) / s
  }
}

/** Um dedo arrastando: a folha acompanha, sem mudar de tamanho. */
export function comArrasto(v: Vista, dx: number, dy: number): Vista {
  return { ...v, x: v.x + dx, y: v.y + dy }
}

type Par = { a: { x: number; y: number }; b: { x: number; y: number } }

const distancia = (p: Par): number => Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y)
const meio = (p: Par): { x: number; y: number } => ({
  x: (p.a.x + p.b.x) / 2,
  y: (p.a.y + p.b.y) / 2
})

/**
 * Pinça de dois dedos: amplia e move ao mesmo tempo.
 *
 * O ponto da folha que estava sob o meio dos dedos continua sob o meio dos
 * dedos depois do gesto. É isso que faz a pinça parecer natural — sem essa
 * âncora, a folha escapa para um canto enquanto se tenta ampliar um trecho.
 *
 * Os pontos chegam em coordenada de tela relativa à área de desenho.
 */
export function comPinca(v: Vista, antes: Par, agora: Par): Vista {
  const dAntes = distancia(antes)
  if (dAntes < 1) return v
  const escala = limitarEscala(v.escala * (distancia(agora) / dAntes))

  const mAntes = meio(antes)
  const mAgora = meio(agora)
  // O ponto da folha ancorado no meio dos dedos, antes do gesto.
  const ancora = { x: (mAntes.x - v.x) / v.escala, y: (mAntes.y - v.y) / v.escala }

  return {
    escala,
    x: mAgora.x - ancora.x * escala,
    y: mAgora.y - ancora.y * escala
  }
}
