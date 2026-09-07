import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * O vault desenhado como o logotipo do app: uma rede de pontos em forma de
 * cérebro.
 *
 * ## Física E forma, não física OU forma
 *
 * A primeira leitura deste pedido foi errada — "ou os nós se arranjam pela
 * física, como no Obsidian, ou eles desenham um cérebro". São compatíveis.
 * A simulação é a de sempre: os nós se repelem, os links puxam, e dá para
 * arrastar. Por cima dela existe UMA força a mais, que devolve para dentro
 * quem sai da silhueta. O contorno não posiciona ninguém; ele só não deixa
 * sair.
 *
 * O efeito é o que o dono descreveu: quanto mais notas, mais pontos, e mais
 * o cérebro se preenche. Com poucas notas é um esboço; com trezentas, sólido.
 *
 * ## Por que não uma biblioteca de grafo
 *
 * `d3-force` faria a simulação, mas não a contenção por silhueta — isso
 * seria uma força personalizada de qualquer jeito. O que sobraria da
 * biblioteca é o laço de integração, que são vinte linhas, e `d3` inteiro
 * pesa mais do que o resto desta tela.
 *
 * ## Canvas, e não SVG
 *
 * São 133 nós e algumas centenas de arestas, redesenhados 60 vezes por
 * segundo enquanto a simulação esfria. Em SVG isso é criar e mexer em
 * centenas de elementos do DOM por quadro; em canvas é um laço de desenho.
 */

/*
 * A silhueta, em coordenadas de 0 a 1 (y para baixo).
 *
 * Um cérebro de perfil virado para a esquerda, como o do ícone: cérebro em
 * cima, fissura, cerebelo embaixo à direita, tronco descendo. É polígono
 * simples com trecho côncavo — a fissura —, e o teste de "está dentro?" por
 * lançamento de raio lida com isso sem cuidado especial.
 *
 * Desenhado à mão, e não extraído do PNG do ícone: rastrear o bitmap traria
 * junto o brilho e a sombra dele, e o contorno mudaria toda vez que alguém
 * trocasse o ícone.
 */
const SILHUETA: [number, number][] = [
  // A cúpula, da testa para a nuca.
  [0.13, 0.25], [0.22, 0.19], [0.32, 0.14], [0.44, 0.11],
  [0.57, 0.12], [0.68, 0.15], [0.78, 0.20], [0.86, 0.27],
  [0.92, 0.36], [0.94, 0.45],
  // A fissura entre cérebro e cerebelo: entra e volta a sair.
  [0.90, 0.53], [0.80, 0.56], [0.86, 0.62],
  // O cerebelo.
  [0.88, 0.70], [0.83, 0.77], [0.74, 0.80], [0.66, 0.79],
  // O tronco, descendo e voltando.
  [0.63, 0.86], [0.60, 0.93], [0.54, 0.91], [0.55, 0.80],
  // O lobo temporal, embaixo e à frente.
  [0.46, 0.79], [0.36, 0.77], [0.27, 0.73], [0.19, 0.67],
  [0.12, 0.59],
  // O lobo frontal, fechando na testa.
  [0.06, 0.50], [0.04, 0.41], [0.07, 0.32]
]

/**
 * A área da silhueta, pela fórmula do laço (shoelace).
 *
 * Calculada uma vez, na carga do módulo, e não escrita à mão: quem mexer num
 * ponto do contorno não pode ter de lembrar de atualizar um número solto —
 * ele erraria, e a distância entre os nós ficaria calibrada para uma forma
 * que não existe mais.
 */
const AREA_SILHUETA = (() => {
  let s = 0
  for (let i = 0, j = SILHUETA.length - 1; i < SILHUETA.length; j = i++) {
    s += SILHUETA[j][0] * SILHUETA[i][1] - SILHUETA[i][0] * SILHUETA[j][1]
  }
  return Math.abs(s / 2)
})()

/** O centro da caixa da silhueta. Para onde a contenção empurra de volta. */
const CENTRO: [number, number] = [0.5, 0.45]

/**
 * A temperatura inicial: o quanto um nó pode andar num quadro, no espaço 0..1.
 *
 * 0,08 é um doze avos da largura da silhueta. Mais do que isso e o primeiro
 * quadro joga tudo para fora de uma vez, antes de a atração ter chance de
 * segurar quem está ligado.
 */
const CALOR_INICIAL = 0.08

/** Quanto a simulação reaquece quando alguém arrasta um nó. */
const CALOR_TOQUE = 0.02

/*
 * O balanço entre espalhar, agrupar e segurar no meio.
 *
 * Três forças, e a escolha da LEI de cada uma importa mais do que o número:
 *
 * - repulsão `k³/d²`, entre todos os pares;
 * - atração `d²/k`, ao longo dos links;
 * - gravidade `r`, para o centro da silhueta.
 *
 * A repulsão foi de `k²/d` (Fruchterman-Reingold puro) para `k³/d²` por um
 * motivo que não é gosto. Com `1/d`, o empurrão para fora dentro de uma nuvem
 * uniforme cresce LINEARMENTE com o raio — exatamente como a gravidade. Duas
 * forças com a mesma lei não se equilibram: uma vence sempre, e o resultado é
 * ou tudo colado no contorno, ou tudo espremido no centro. Não existe
 * meio-termo, e a primeira versão desta tela caiu no primeiro caso — um
 * cérebro oco, com o miolo vazio e um anel de pontos na borda.
 *
 * Com `1/d², o empurrão para fora deixa de crescer com o raio, a gravidade
 * passa a vencer a partir de certa distância, e aí existe um raio de
 * equilíbrio — que é o que preenche a silhueta.
 *
 * Os números saíram de uma varredura sobre este vault (133 notas, 392
 * ligações): com 1,0 e 0,7, sobram 22 nós encostados no contorno — e 19
 * deles são as notas SEM ligação nenhuma, que não têm o que as segure para
 * dentro. Esse anel fino é informação, não defeito: é o que ainda não foi
 * ligado a nada.
 *
 * `k³` no numerador, e não uma constante solta, é o que mantém tudo isto
 * válido quando o vault crescer: `k` encolhe com o número de notas, e as
 * três forças encolhem junto, na mesma proporção.
 */
const GANHO_REPULSAO = 1.0
const GANHO_ATRACAO = 0.55
const GANHO_GRAVIDADE = 0.7

type No = {
  path: string
  title: string
  tipo: string
  grau: number
  x: number
  y: number
  vx: number
  vy: number
  /** Preso pelo dedo: a física não mexe nele enquanto está sendo arrastado. */
  preso: boolean
}

type Aresta = { de: string; para: string }

/**
 * O ponto está dentro do polígono?
 *
 * Lançamento de raio: conta quantas arestas um raio horizontal atravessa à
 * direita do ponto. Ímpar quer dizer dentro. Funciona com polígono côncavo,
 * que é o caso da fissura.
 */
function dentro(px: number, py: number, poli: [number, number][]): boolean {
  let sim = false
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i]
    const [xj, yj] = poli[j]
    const cruza = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (cruza) sim = !sim
  }
  return sim
}

/** O ponto do segmento mais perto de `p`. */
function maisPertoNoSegmento(
  px: number, py: number, ax: number, ay: number, bx: number, by: number
): [number, number] {
  const dx = bx - ax
  const dy = by - ay
  const comp = dx * dx + dy * dy
  if (comp === 0) return [ax, ay]
  // Projeta no segmento e prende entre as pontas: sem o `min/max` a projeção
  // cai fora do trecho e o nó seria puxado para a reta infinita, e não para
  // a borda que existe.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / comp))
  return [ax + t * dx, ay + t * dy]
}

/** O ponto da borda do polígono mais perto de `p`. */
function pontoNaBorda(px: number, py: number, poli: [number, number][]): [number, number] {
  let melhor: [number, number] = poli[0]
  let menor = Infinity
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [qx, qy] = maisPertoNoSegmento(px, py, poli[j][0], poli[j][1], poli[i][0], poli[i][1])
    const d = (px - qx) ** 2 + (py - qy) ** 2
    if (d < menor) { menor = d; melhor = [qx, qy] }
  }
  return melhor
}

/**
 * A cor de cada tipo de nota.
 *
 * As mesmas famílias do resto do app. O que não está aqui cai no tom neutro:
 * uma paleta com trinta cores não distingue nada, e tipo raro no meio de um
 * grafo vira ruído colorido.
 */
const COR: Record<string, string> = {
  prova: '#e98d8a',
  simulado: '#e98d8a',
  materia: '#dfb65e',
  'treino-modelo': '#82c68a',
  sessao: '#82c68a',
  cardio: '#82c68a',
  rotina: '#82c68a',
  evento: '#b9a6f0',
  tarefa: '#b9a6f0',
  consulta: '#b9a6f0',
  nota: '#5faadd',
  anotacao: '#5faadd',
  diario: '#6f7a86'
}
const COR_PADRAO = '#7e8a97'

/**
 * O raio do ponto, a partir do grau.
 *
 * Raiz, e não proporcional: um nó com 30 links não pode ter trinta vezes o
 * raio de um com 1 — ele engoliria a tela inteira sozinho.
 */
const raioDe = (grau: number): number => 2.6 + Math.sqrt(grau) * 1.9

export function Cerebro({ aoAbrir }: { aoAbrir: (path: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [dados, setDados] = useState<{ nos: No[]; arestas: Aresta[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState<No | null>(null)
  const [busca, setBusca] = useState('')

  /*
   * Tudo o que muda 60 vezes por segundo mora em `ref`, e não em `useState`.
   *
   * Posição de nó, zoom e deslocamento mudam a cada quadro. Em `useState`,
   * cada quadro seria uma renderização do React inteira — para desenhar num
   * canvas que o React nem controla. O estado do React aqui é só o que a
   * pessoa vê FORA do canvas: o nome sob o cursor, o erro, a busca.
   */
  const vista = useRef({ zoom: 1, dx: 0, dy: 0 })
  const arrastando = useRef<{ no: No | null; ox: number; oy: number }>({ no: null, ox: 0, oy: 0 })
  const calor = useRef(CALOR_INICIAL)

  useEffect(() => {
    let vivo = true
    void window.vaultApi.invoke('vault:grafo', {})
      .then(r => {
        if (!vivo) return
        const bruto = r as { nos: Omit<No, 'x' | 'y' | 'vx' | 'vy' | 'preso'>[]; arestas: Aresta[] }
        /*
         * Começa em espiral, e não em posições sorteadas.
         *
         * Com posições aleatórias, dois nós podem nascer no mesmo ponto: a
         * repulsão entre eles é uma divisão por zero, e o grafo inteiro
         * explode no primeiro quadro. A espiral pelo ângulo de ouro
         * distribui sem repetir e sem depender de sorte.
         */
        const nos: No[] = bruto.nos.map((n, i) => {
          const ang = i * 2.399963
          const r = 0.36 * Math.sqrt(i / Math.max(1, bruto.nos.length))
          return {
            ...n,
            x: 0.5 + r * Math.cos(ang),
            y: 0.45 + r * Math.sin(ang),
            vx: 0, vy: 0, preso: false
          }
        })
        setDados({ nos, arestas: bruto.arestas })
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : 'não deu para ler a rede')
      })
    return () => { vivo = false }
  }, [])

  /** Índice de vizinhos, para acender o que está ligado ao nó sob o cursor. */
  const vizinhos = useMemo(() => {
    const m = new Map<string, Set<string>>()
    if (!dados) return m
    for (const a of dados.arestas) {
      if (!m.has(a.de)) m.set(a.de, new Set())
      if (!m.has(a.para)) m.set(a.para, new Set())
      m.get(a.de)?.add(a.para)
      m.get(a.para)?.add(a.de)
    }
    return m
  }, [dados])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !dados) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const porPath = new Map(dados.nos.map(n => [n.path, n]))
    let quadro = 0

    /** Ajusta o canvas ao tamanho na tela, respeitando a densidade do monitor. */
    const dimensionar = (): { l: number; a: number } => {
      const r = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { l: r.width, a: r.height }
    }

    let { l, a } = dimensionar()
    const aoRedimensionar = (): void => { ({ l, a } = dimensionar()) }
    window.addEventListener('resize', aoRedimensionar)

    /*
     * A caixa do cérebro dentro do canvas.
     *
     * Quadrada e centrada: a silhueta foi desenhada num quadrado, e esticá-la
     * para o formato da janela daria um cérebro achatado em monitor largo.
     */
    const caixa = (): { ox: number; oy: number; t: number } => {
      const t = Math.min(l, a) * 0.86
      return { ox: (l - t) / 2, oy: (a - t) / 2, t }
    }

    /** Do espaço da silhueta (0..1) para o pixel na tela, já com zoom e pan. */
    const paraTela = (x: number, y: number): [number, number] => {
      const { ox, oy, t } = caixa()
      const { zoom, dx, dy } = vista.current
      return [
        (ox + x * t - l / 2) * zoom + l / 2 + dx,
        (oy + y * t - a / 2) * zoom + a / 2 + dy
      ]
    }

    /** O caminho de volta: do pixel para o espaço da silhueta. */
    const paraGrafo = (px: number, py: number): [number, number] => {
      const { ox, oy, t } = caixa()
      const { zoom, dx, dy } = vista.current
      return [
        ((px - dx - l / 2) / zoom + l / 2 - ox) / t,
        ((py - dy - a / 2) / zoom + a / 2 - oy) / t
      ]
    }

    /*
     * A distância de equilíbrio entre dois nós.
     *
     * `k = raiz(área / n)` é a conta do Fruchterman-Reingold: reparte a área
     * disponível entre os nós e devolve o lado da célula de cada um. Com as
     * 133 notas de hoje dá 0,064; com 300, dá 0,043 — os pontos se aproximam
     * sozinhos conforme o vault cresce, que é justamente o comportamento
     * pedido ("quanto mais notas mais pontos ficam do cérebro").
     *
     * A primeira versão desta tela usava constantes chutadas: repulsão
     * `0,00028/d²` e mola de comprimento fixo. O resultado era todo mundo
     * empurrado para fora e grudado no contorno — 133 nós desenhavam umas
     * trinta bolhas, porque dezenas caíam exatamente no mesmo ponto da borda.
     */
    const k = Math.sqrt(AREA_SILHUETA / Math.max(1, dados.nos.length))

    const passo = (): void => {
      const nos = dados.nos
      const c = calor.current

      // O deslocamento deste quadro. Fruchterman-Reingold trabalha com
      // deslocamento, e não com velocidade: cada quadro parte do zero, e por
      // isso não há energia acumulada para o grafo explodir.
      for (const n of nos) { n.vx = 0; n.vy = 0 }

      /*
       * Repulsão entre todos os pares: k³/d².
       *
       * O(n²), e de propósito: são ~130 nós, ou 8 mil pares por quadro, que
       * dá menos de um milissegundo. Barnes-Hut só compensaria acima de
       * alguns milhares, e traria uma quadtree inteira junto.
       */
      for (let i = 0; i < nos.length; i++) {
        for (let j = i + 1; j < nos.length; j++) {
          const A = nos[i]
          const B = nos[j]
          let dx = B.x - A.x
          let dy = B.y - A.y
          let d = Math.hypot(dx, dy)
          /*
           * Piso na distância, e não só proteção contra o zero.
           *
           * Com `1/d²`, dois nós que se aproximam demais geram uma força
           * enorme e um chuta o outro para fora da silhueta. O piso é um
           * décimo da distância de equilíbrio: perto o bastante para nunca
           * atrapalhar, longe o bastante para a força não explodir.
           */
          const piso = k * 0.1
          if (d < piso) {
            if (d < 1e-9) {
              dx = (Math.random() - 0.5) * piso
              dy = (Math.random() - 0.5) * piso
            }
            d = piso
          }
          const f = (GANHO_REPULSAO * k * k * k) / (d * d)
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          A.vx -= fx; A.vy -= fy
          B.vx += fx; B.vy += fy
        }
      }

      // Atração ao longo dos links: d²/k. Cresce com a distância, então dois
      // nós ligados nunca ficam em cantos opostos da silhueta.
      for (const e of dados.arestas) {
        const A = porPath.get(e.de)
        const B = porPath.get(e.para)
        if (!A || !B) continue
        const dx = B.x - A.x
        const dy = B.y - A.y
        const d = Math.hypot(dx, dy) || 1e-6
        const f = (GANHO_ATRACAO * d * d) / k
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        A.vx += fx; A.vy += fy
        B.vx -= fx; B.vy -= fy
      }

      // A gravidade. Cresce com a distância, então mal se nota no miolo e
      // segura firme quem tenta escapar pela borda.
      for (const n of nos) {
        n.vx += (CENTRO[0] - n.x) * GANHO_GRAVIDADE
        n.vy += (CENTRO[1] - n.y) * GANHO_GRAVIDADE
      }

      for (const n of nos) {
        if (n.preso) continue

        // O deslocamento é limitado pela temperatura: é ela que impede um
        // salto gigante no primeiro quadro, quando tudo ainda está amontoado.
        const d = Math.hypot(n.vx, n.vy)
        if (d > 1e-9) {
          const anda = Math.min(d, c)
          n.x += (n.vx / d) * anda
          n.y += (n.vy / d) * anda
        }

        /*
         * A contenção — a única coisa que este grafo tem a mais que o do
         * Obsidian.
         *
         * Saiu da silhueta? Volta para logo DENTRO da borda, e não para cima
         * dela: encostado exatamente no contorno, um punhado de nós converge
         * para o mesmo vértice e some um dentro do outro. O passo para dentro
         * é na direção do centro, então varia conforme o lado por onde o nó
         * saiu, e eles não se empilham.
         */
        if (!dentro(n.x, n.y, SILHUETA)) {
          const [bx, by] = pontoNaBorda(n.x, n.y, SILHUETA)
          const ux = CENTRO[0] - bx
          const uy = CENTRO[1] - by
          const m = Math.hypot(ux, uy) || 1
          n.x = bx + (ux / m) * (k * 0.35)
          n.y = by + (uy / m) * (k * 0.35)
        }
      }

      // Esfria devagar e para. Uma simulação que nunca para deixa o
      // ventilador do notebook ligado numa tela que ninguém está olhando.
      if (calor.current > 0.0008) calor.current *= 0.985
    }

    const desenhar = (): void => {
      ctx.clearRect(0, 0, l, a)

      const alvo = sobre
      const acesos = alvo ? vizinhos.get(alvo.path) ?? new Set<string>() : null
      const termo = busca.trim().toLowerCase()

      // O contorno, bem apagado: dá o enquadramento sem competir com os nós.
      ctx.beginPath()
      SILHUETA.forEach(([x, y], i) => {
        const [px, py] = paraTela(x, y)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.strokeStyle = 'rgba(95,170,221,.13)'
      ctx.lineWidth = 1
      ctx.stroke()

      // As arestas primeiro, para os nós ficarem por cima.
      ctx.lineWidth = 1
      for (const e of dados.arestas) {
        const A = porPath.get(e.de)
        const B = porPath.get(e.para)
        if (!A || !B) continue
        const ligada = alvo !== null && (e.de === alvo.path || e.para === alvo.path)
        ctx.strokeStyle = ligada
          ? 'rgba(95,170,221,.75)'
          : alvo
            ? 'rgba(126,138,151,.10)'
            : 'rgba(126,138,151,.26)'
        const [ax, ay] = paraTela(A.x, A.y)
        const [bx, by] = paraTela(B.x, B.y)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }

      for (const n of dados.nos) {
        const [px, py] = paraTela(n.x, n.y)
        const r = raioDe(n.grau) * vista.current.zoom
        const cor = COR[n.tipo] ?? COR_PADRAO

        const achado = termo !== '' && n.title.toLowerCase().includes(termo)
        const apagado = (alvo !== null && n.path !== alvo.path && !acesos?.has(n.path)) ||
          (termo !== '' && !achado)

        // O halo — dois círculos, e não `shadowBlur`: o brilho do canvas é
        // recalculado por forma e derruba a taxa de quadros com 130 nós.
        ctx.globalAlpha = apagado ? 0.10 : 0.22
        ctx.fillStyle = cor
        ctx.beginPath()
        ctx.arc(px, py, r * 2.4, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalAlpha = apagado ? 0.22 : 1
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // O nome só aparece de perto, no que está sob o cursor, e no que a
        // busca achou. Todos de uma vez seria uma parede de texto.
        const mostrarNome = n.path === alvo?.path || achado ||
          (vista.current.zoom > 1.7 && n.grau > 0)
        if (mostrarNome) {
          ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
          ctx.fillStyle = 'rgba(232,236,241,.92)'
          ctx.textAlign = 'center'
          ctx.fillText(n.title, px, py - r - 6)
        }
      }
    }

    const laco = (): void => {
      passo()
      desenhar()
      quadro = requestAnimationFrame(laco)
    }
    quadro = requestAnimationFrame(laco)

    /** O nó sob o ponteiro, ou `null`. */
    const noPonto = (px: number, py: number): No | null => {
      let achado: No | null = null
      let menor = Infinity
      for (const n of dados.nos) {
        const [nx, ny] = paraTela(n.x, n.y)
        const d = Math.hypot(px - nx, py - ny)
        // Alvo mínimo de 9 px: um nó de grau zero tem 2,6 px de raio, e
        // acertar isso com o mouse seria sorte.
        const alcance = Math.max(9, raioDe(n.grau) * vista.current.zoom + 4)
        if (d < alcance && d < menor) { menor = d; achado = n }
      }
      return achado
    }

    const posicao = (e: PointerEvent | WheelEvent): [number, number] => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }

    const aoDescer = (e: PointerEvent): void => {
      const [px, py] = posicao(e)
      const n = noPonto(px, py)
      canvas.setPointerCapture(e.pointerId)
      if (n) {
        n.preso = true
        arrastando.current = { no: n, ox: 0, oy: 0 }
        // Reaquece: arrastar um nó tem de mexer a vizinhança dele, senão
        // parece que o grafo congelou.
        calor.current = Math.max(calor.current, CALOR_TOQUE)
      } else {
        arrastando.current = { no: null, ox: px - vista.current.dx, oy: py - vista.current.dy }
      }
    }

    const aoMover = (e: PointerEvent): void => {
      const [px, py] = posicao(e)
      const arr = arrastando.current
      if (arr.no) {
        const [gx, gy] = paraGrafo(px, py)
        arr.no.x = gx
        arr.no.y = gy
        arr.no.vx = 0
        arr.no.vy = 0
        return
      }
      if (e.buttons === 1) {
        vista.current.dx = px - arr.ox
        vista.current.dy = py - arr.oy
        return
      }
      // Sem botão apertado: só o realce do que está sob o cursor.
      const n = noPonto(px, py)
      setSobre(atual => (atual?.path === n?.path ? atual : n))
      canvas.style.cursor = n ? 'pointer' : 'grab'
    }

    const aoSubir = (e: PointerEvent): void => {
      const arr = arrastando.current
      if (arr.no) {
        // Solta o nó de volta para a física. Sem isto ele ficaria pregado
        // onde o dedo largou, e a rede perderia o equilíbrio aos poucos.
        arr.no.preso = false
        calor.current = Math.max(calor.current, CALOR_TOQUE)
      }
      arrastando.current = { no: null, ox: 0, oy: 0 }
      canvas.releasePointerCapture(e.pointerId)
    }

    const aoClicar = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect()
      const n = noPonto(e.clientX - r.left, e.clientY - r.top)
      if (n) aoAbrir(n.path)
    }

    const aoRolar = (e: WheelEvent): void => {
      e.preventDefault()
      const [px, py] = posicao(e)
      const antes = paraGrafo(px, py)
      vista.current.zoom = Math.min(
        6, Math.max(0.4, vista.current.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
      )
      // Corrige o deslocamento para o ponto sob o cursor não escorregar —
      // sem isto o zoom afasta justamente do que a pessoa está olhando.
      const depois = paraGrafo(px, py)
      const { t } = caixa()
      vista.current.dx += (depois[0] - antes[0]) * t * vista.current.zoom
      vista.current.dy += (depois[1] - antes[1]) * t * vista.current.zoom
    }

    canvas.addEventListener('pointerdown', aoDescer)
    canvas.addEventListener('pointermove', aoMover)
    canvas.addEventListener('pointerup', aoSubir)
    canvas.addEventListener('click', aoClicar)
    canvas.addEventListener('wheel', aoRolar, { passive: false })

    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('resize', aoRedimensionar)
      canvas.removeEventListener('pointerdown', aoDescer)
      canvas.removeEventListener('pointermove', aoMover)
      canvas.removeEventListener('pointerup', aoSubir)
      canvas.removeEventListener('click', aoClicar)
      canvas.removeEventListener('wheel', aoRolar)
    }
  }, [dados, sobre, vizinhos, busca, aoAbrir])

  const ligados = dados ? dados.nos.filter(n => n.grau > 0).length : 0

  return (
    <div className="cerebro">
      <div className="cerebro-topo">
        <div className="cerebro-conta">
          {dados
            ? <>
                <strong>{dados.nos.length}</strong> notas ·{' '}
                <strong>{dados.arestas.length}</strong> ligações ·{' '}
                {dados.nos.length - ligados} soltas
              </>
            : 'lendo a rede…'}
        </div>
        <input
          className="cerebro-busca"
          type="search"
          value={busca}
          placeholder="acender uma nota"
          onChange={e => setBusca(e.target.value)}
        />
        <button
          className="btn-fantasma"
          onClick={() => { vista.current = { zoom: 1, dx: 0, dy: 0 }; calor.current = CALOR_INICIAL }}
          title="Voltar o enquadramento e sacudir a rede"
        >
          Reorganizar
        </button>
      </div>

      {erro && <div className="aviso aviso-erro">{erro}</div>}

      <div className="cerebro-tela">
        <canvas ref={canvasRef} />
        {sobre && (
          <div className="cerebro-nome">
            <strong>{sobre.title}</strong>
            <span>{sobre.tipo} · {sobre.grau} {sobre.grau === 1 ? 'ligação' : 'ligações'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
