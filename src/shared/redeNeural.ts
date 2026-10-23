/**
 * A rede neural que se mexe na tela de abertura.
 *
 * Pedido dele: "queria fazer uma animaçãozinha, sabe? A rede neural que eu
 * tenho hoje, só que uma gigantesca, mexendo as bolinhas — não a minha,
 * específico, mas como se fosse do próprio Cortex".
 *
 * Ela não representa o vault dele: é um grafo inventado, com o espírito do
 * Cortex (notas que se ligam) sem fingir ser dado real. Mostrar ligações
 * falsas como se fossem as dele seria mentir numa tela que ele vê todo dia.
 *
 * Só a MATEMÁTICA mora aqui — posições, deslocamento, quem se liga a quem.
 * O desenho é canvas, e canvas não se testa sem navegador; já o sorteio e o
 * movimento erram em silêncio, e é isso que este módulo torna verificável.
 */

export type No = {
  /** Posição em fração da tela, de 0 a 1 — resolve em qualquer tamanho. */
  x: number
  y: number
  /** Velocidade por segundo, também em fração da tela. */
  vx: number
  vy: number
  /** Raio relativo, de 0,4 a 1: dá profundidade sem precisar de eixo Z. */
  tamanho: number
}

/** Até onde dois nós se enxergam, em fração da tela. */
export const ALCANCE = 0.17

/**
 * Semeia a rede.
 *
 * `sorteio` é injetado para o teste ser determinístico — e porque um
 * `Math.random()` escondido aqui dentro deixaria a função impossível de
 * verificar.
 */
export function semear(quantos: number, sorteio: () => number = Math.random): No[] {
  const nos: No[] = []
  for (let i = 0; i < Math.max(0, quantos); i++) {
    nos.push({
      x: sorteio(),
      y: sorteio(),
      /* Devagar de propósito: isto é pano de fundo de uma tela que dura dois
         segundos, e movimento rápido aqui vira cócega no olho. */
      vx: (sorteio() - 0.5) * 0.03,
      vy: (sorteio() - 0.5) * 0.03,
      tamanho: 0.4 + sorteio() * 0.6
    })
  }
  return nos
}

/**
 * Avança a rede em `dt` segundos.
 *
 * Quem sai por um lado volta pelo outro, em vez de quicar na borda: assim a
 * nuvem nunca se acumula nos cantos, que é o que acontece quando os nós
 * refletem.
 *
 * `dt` é limitado porque a janela pode ficar escondida e voltar com um salto
 * de vários segundos — sem o teto, os nós dariam um pulo na primeira pintura.
 */
export function avancar(nos: No[], dt: number): No[] {
  const passo = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.05) : 0
  return nos.map(n => ({
    ...n,
    x: enrolar(n.x + n.vx * passo),
    y: enrolar(n.y + n.vy * passo)
  }))
}

function enrolar(v: number): number {
  if (v < 0) return v + 1
  if (v > 1) return v - 1
  return v
}

export type Ligacao = { a: number; b: number; forca: number }

/**
 * Quem está perto de quem, e quanto.
 *
 * `forca` vai de 0 (no limite do alcance) a 1 (encostados), e é o que faz a
 * linha nascer apagada e firmar conforme os nós se aproximam. Sem isso as
 * ligações piscariam ao cruzar a fronteira do alcance.
 *
 * O par é contado uma vez só (`j` começa depois de `i`): desenhar os dois
 * sentidos dobraria o traço e deixaria as linhas mais escuras que o previsto.
 */
export function ligacoes(nos: No[], alcance = ALCANCE): Ligacao[] {
  const out: Ligacao[] = []
  for (let i = 0; i < nos.length; i++) {
    for (let j = i + 1; j < nos.length; j++) {
      const a = nos[i]
      const b = nos[j]
      if (!a || !b) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d > alcance) continue
      out.push({ a: i, b: j, forca: 1 - d / alcance })
    }
  }
  return out
}

/**
 * Quantos nós desenhar numa tela deste tamanho.
 *
 * Proporcional à área, com teto: ele pediu "uma gigantesca", mas as ligações
 * crescem ao QUADRADO do número de nós, e passar de uma centena transforma a
 * abertura num travamento — justamente na hora em que o app deveria parecer
 * rápido.
 */
export function quantosNos(largura: number, altura: number): number {
  const area = Math.max(0, largura) * Math.max(0, altura)
  if (area === 0) return 0
  return Math.min(110, Math.max(24, Math.round(area / 14000)))
}
