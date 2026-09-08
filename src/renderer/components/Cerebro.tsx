import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * O vault inteiro como rede: um ponto por nota, uma linha por ligação.
 *
 * ## Já foi em forma de cérebro
 *
 * A primeira versão prendia os nós dentro da silhueta do logotipo. Funcionava
 * — e ficou bonita —, mas apertar 133 pontos dentro de um contorno os empurra
 * para blocos densos, e a estrutura que interessa (o que se liga a quê) some
 * dentro das manchas. O dono comparou com o grafo que já conhecia e pediu
 * este: solto, radial, com o desenho saindo das ligações e não de um molde.
 *
 * A silhueta saiu do código junto com a decisão. Deixá-la desligada seria
 * guardar cem linhas de física que ninguém executa.
 *
 * ## Cor por PASTA, e não por tipo
 *
 * Colorir por `tipo` deixava quase tudo azul: a esmagadora maioria das notas
 * é do tipo `nota`, e a cor não separava nada. A pasta de primeiro nível é o
 * agrupamento que a pessoa de fato usa para pensar — Dev, Saúde, Estudos — e
 * é ela que faz os aglomerados aparecerem coloridos.
 *
 * ## Canvas, e não SVG
 *
 * São 133 nós e algumas centenas de arestas, redesenhados 60 vezes por
 * segundo enquanto a simulação esfria. Em SVG isso é criar e mexer em
 * centenas de elementos do DOM por quadro; em canvas é um laço de desenho.
 *
 * ## Por que não uma biblioteca de grafo
 *
 * O que sobraria do `d3-force` aqui é o laço de integração, que são vinte
 * linhas — e `d3` inteiro pesa mais do que o resto desta tela.
 */

type No = {
  path: string
  title: string
  tipo: string
  grau: number
  x: number
  y: number
  /** Deslocamento acumulado no quadro; zerado a cada passo. */
  dx: number
  dy: number
  /** Preso pelo dedo: a física não mexe nele enquanto está sendo arrastado. */
  preso: boolean
}

type Aresta = { de: string; para: string }

/**
 * A cor de cada pasta de primeiro nível.
 *
 * Sete cores para sete pastas, escolhidas para se distinguirem entre si sobre
 * fundo escuro — e não para combinar com a marca. Numa tela cuja única função
 * é separar grupos, cor bonita que se confunde com a vizinha não serve.
 *
 * O que não estiver aqui cai no cinza: uma paleta que cresce sozinha a cada
 * pasta nova acaba com dois azuis quase iguais e não distingue mais nada.
 */
const COR_PASTA: Record<string, string> = {
  Dev: '#4a90e2',
  Saude: '#4fc98a',
  Estudos: '#e05f5f',
  Vida: '#9b6ef3',
  Grana: '#e0a33a',
  Agenda: '#e06ba8',
  Diario: '#6f7680'
}
const COR_PADRAO = '#9aa2ab'

/** A pasta de primeiro nível, que é o que decide a cor. */
function pastaDe(path: string): string {
  const barra = path.indexOf('/')
  // Nota na raiz do vault não tem pasta: entra no grupo neutro, em vez de
  // virar um grupo com o nome do próprio arquivo.
  return barra < 0 ? '' : path.slice(0, barra)
}

const corDe = (path: string): string => COR_PASTA[pastaDe(path)] ?? COR_PADRAO

/**
 * O raio do ponto, a partir do grau.
 *
 * Raiz, e não proporcional: um nó com 30 links não pode ter trinta vezes o
 * raio de um com 1 — ele engoliria a tela sozinho. A base é pequena porque o
 * que se lê nesta tela são as LINHAS; ponto grande demais cobre a ligação que
 * chega nele.
 */
const raioDe = (grau: number): number => 1.8 + Math.sqrt(grau) * 1.1

/**
 * A área nominal do desenho, em coordenadas do grafo.
 *
 * Não é moldura — nada impede um nó de sair dela. Serve para uma conta só:
 * repartir o espaço entre os nós e obter a distância de equilíbrio. Quanto
 * mais notas, mais perto uma da outra, e o enquadramento cuida do resto.
 */
const AREA = 0.6

/*
 * As três forças, e a LEI de cada uma importa mais do que o número.
 *
 * - repulsão `k³/d²`, entre todos os pares;
 * - atração `d²/k`, ao longo dos links;
 * - gravidade `r`, para o centro.
 *
 * A repulsão é `1/d²` e não `1/d` (o Fruchterman-Reingold clássico) por um
 * motivo que não é gosto: com `1/d`, o empurrão para fora dentro de uma nuvem
 * uniforme cresce linearmente com o raio — exatamente como a gravidade. Duas
 * forças com a mesma lei não se equilibram, uma vence sempre, e o resultado é
 * ou tudo espremido no centro ou tudo espalhado sem fim. Com `1/d²` o
 * empurrão para de crescer com o raio, a gravidade vence a partir de certa
 * distância, e existe um raio de equilíbrio.
 *
 * `k³` no numerador, e não uma constante solta, é o que mantém isto válido
 * quando o vault crescer: `k` encolhe com o número de notas e as três forças
 * encolhem junto, na mesma proporção.
 */
const GANHO_REPULSAO = 1.0
const GANHO_ATRACAO = 0.40
const GANHO_GRAVIDADE = 0.55

/** Quanto um nó pode andar num quadro, no início. */
const CALOR_INICIAL = 0.08
/** Quanto a simulação reaquece quando alguém arrasta um nó. */
const CALOR_TOQUE = 0.02
/** A escala em que os pontos têm o tamanho de desenho. */
const ESCALA_BASE = 600

export function Cerebro({ aoAbrir }: { aoAbrir: (path: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [dados, setDados] = useState<{ nos: No[]; arestas: Aresta[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState<No | null>(null)
  const [busca, setBusca] = useState('')

  /*
   * Tudo o que muda 60 vezes por segundo mora em `ref`, e não em `useState`.
   *
   * Posição de nó e câmera mudam a cada quadro. Em `useState`, cada quadro
   * seria uma renderização do React inteira — para desenhar num canvas que o
   * React nem controla. O estado do React aqui é só o que a pessoa vê FORA do
   * canvas: o nome sob o cursor, o erro, a busca.
   */
  const camera = useRef({ x: 0.5, y: 0.5, escala: ESCALA_BASE })
  const arrastando = useRef<{ no: No | null; px: number; py: number } | null>(null)
  const calor = useRef(CALOR_INICIAL)
  /** Enquadra assim que a simulação assentar — uma vez só, ver `laco`. */
  const precisaEnquadrar = useRef(true)

  useEffect(() => {
    let vivo = true
    void window.vaultApi.invoke('vault:grafo', {})
      .then(r => {
        if (!vivo) return
        const bruto = r as {
          nos: Omit<No, 'x' | 'y' | 'dx' | 'dy' | 'preso'>[]
          arestas: Aresta[]
        }
        /*
         * Começa em espiral, e não em posições sorteadas.
         *
         * Com posições aleatórias, dois nós podem nascer no mesmo ponto: a
         * repulsão entre eles é uma divisão por zero, e o grafo inteiro
         * explode no primeiro quadro. A espiral pelo ângulo de ouro distribui
         * sem repetir e sem depender de sorte.
         */
        const nos: No[] = bruto.nos.map((n, i) => {
          const ang = i * 2.399963
          const r = 0.4 * Math.sqrt(i / Math.max(1, bruto.nos.length))
          return {
            ...n,
            x: 0.5 + r * Math.cos(ang),
            y: 0.5 + r * Math.sin(ang),
            dx: 0, dy: 0, preso: false
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

  /** As pastas presentes, para a legenda. Só as que têm nota de verdade. */
  const legenda = useMemo(() => {
    if (!dados) return []
    const conta = new Map<string, number>()
    for (const n of dados.nos) {
      const p = pastaDe(n.path) || '(raiz)'
      conta.set(p, (conta.get(p) ?? 0) + 1)
    }
    return [...conta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, quantas]) => ({ nome, quantas, cor: COR_PASTA[nome] ?? COR_PADRAO }))
  }, [dados])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !dados) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const porPath = new Map(dados.nos.map(n => [n.path, n]))
    let quadro = 0
    let l = 0
    let a = 0

    const dimensionar = (): void => {
      const r = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      l = Math.max(1, r.width)
      a = Math.max(1, r.height)
      canvas.width = Math.round(l * dpr)
      canvas.height = Math.round(a * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    dimensionar()
    const aoRedimensionar = (): void => { dimensionar() }
    window.addEventListener('resize', aoRedimensionar)

    /*
     * Câmera simples: um centro e uma escala em pixels por unidade.
     *
     * A versão anterior tinha uma caixa quadrada dentro do canvas mais zoom e
     * deslocamento por cima — três transformações encadeadas para acertar uma
     * coisa só. Sem a silhueta não há caixa a respeitar, e isto vira o que
     * sempre deveria ter sido.
     */
    const paraTela = (x: number, y: number): [number, number] => [
      (x - camera.current.x) * camera.current.escala + l / 2,
      (y - camera.current.y) * camera.current.escala + a / 2
    ]
    const paraGrafo = (px: number, py: number): [number, number] => [
      (px - l / 2) / camera.current.escala + camera.current.x,
      (py - a / 2) / camera.current.escala + camera.current.y
    ]

    /** Ajusta a câmera para tudo caber, com folga nas beiradas. */
    const enquadrar = (): void => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const n of dados.nos) {
        if (n.x < x0) x0 = n.x
        if (n.y < y0) y0 = n.y
        if (n.x > x1) x1 = n.x
        if (n.y > y1) y1 = n.y
      }
      if (!Number.isFinite(x0)) return
      camera.current.x = (x0 + x1) / 2
      camera.current.y = (y0 + y1) / 2
      // A folga não é estética: sem ela os nós da borda ficam cortados pela
      // metade, e nó pela metade parece defeito de desenho.
      const largura = Math.max(1e-6, x1 - x0)
      const altura = Math.max(1e-6, y1 - y0)
      camera.current.escala = Math.min(l / largura, a / altura) * 0.86
    }

    const k = Math.sqrt(AREA / Math.max(1, dados.nos.length))

    const passo = (): void => {
      const nos = dados.nos
      const c = calor.current

      // Deslocamento, e não velocidade: cada quadro parte do zero, e por isso
      // não há energia acumulada para o grafo explodir.
      for (const n of nos) { n.dx = 0; n.dy = 0 }

      /*
       * Repulsão entre todos os pares.
       *
       * O(n²), e de propósito: são ~130 nós, ou 8 mil pares por quadro, que
       * dá menos de um milissegundo. Barnes-Hut só compensaria acima de
       * alguns milhares, e traria uma quadtree inteira junto.
       */
      for (let i = 0; i < nos.length; i++) {
        for (let j = i + 1; j < nos.length; j++) {
          const A = nos[i]
          const B = nos[j]
          let ex = B.x - A.x
          let ey = B.y - A.y
          let d = Math.hypot(ex, ey)
          /*
           * Piso na distância, e não só proteção contra o zero.
           *
           * Com `1/d²`, dois nós que se aproximam demais geram uma força
           * enorme e um chuta o outro para o outro lado da tela. O piso é um
           * décimo da distância de equilíbrio: perto o bastante para nunca
           * atrapalhar, longe o bastante para a força não explodir.
           */
          const piso = k * 0.1
          if (d < piso) {
            if (d < 1e-9) {
              ex = (Math.random() - 0.5) * piso
              ey = (Math.random() - 0.5) * piso
            }
            d = piso
          }
          const f = (GANHO_REPULSAO * k * k * k) / (d * d)
          const fx = (ex / d) * f
          const fy = (ey / d) * f
          A.dx -= fx; A.dy -= fy
          B.dx += fx; B.dy += fy
        }
      }

      // Atração ao longo dos links: cresce com a distância, então dois nós
      // ligados nunca ficam em cantos opostos da tela.
      for (const e of dados.arestas) {
        const A = porPath.get(e.de)
        const B = porPath.get(e.para)
        if (!A || !B) continue
        const ex = B.x - A.x
        const ey = B.y - A.y
        const d = Math.hypot(ex, ey) || 1e-6
        const f = (GANHO_ATRACAO * d * d) / k
        const fx = (ex / d) * f
        const fy = (ey / d) * f
        A.dx += fx; A.dy += fy
        B.dx -= fx; B.dy -= fy
      }

      // A gravidade. Cresce com a distância, então mal se nota no miolo e
      // segura firme quem tenta escapar para longe.
      for (const n of nos) {
        n.dx += (0.5 - n.x) * GANHO_GRAVIDADE
        n.dy += (0.5 - n.y) * GANHO_GRAVIDADE
      }

      for (const n of nos) {
        if (n.preso) continue
        // O passo é limitado pela temperatura: é ela que impede um salto
        // gigante no primeiro quadro, quando tudo ainda está amontoado.
        const d = Math.hypot(n.dx, n.dy)
        if (d > 1e-9) {
          const anda = Math.min(d, c)
          n.x += (n.dx / d) * anda
          n.y += (n.dy / d) * anda
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

      // As arestas primeiro, para os nós ficarem por cima.
      ctx.lineWidth = 1
      for (const e of dados.arestas) {
        const A = porPath.get(e.de)
        const B = porPath.get(e.para)
        if (!A || !B) continue
        const ligada = alvo !== null && (e.de === alvo.path || e.para === alvo.path)
        ctx.strokeStyle = ligada
          ? 'rgba(150,200,240,.85)'
          : alvo
            ? 'rgba(140,150,163,.07)'
            : 'rgba(140,150,163,.30)'
        const [ax, ay] = paraTela(A.x, A.y)
        const [bx, by] = paraTela(B.x, B.y)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }

      // O ponto cresce com o zoom, mas devagar e com teto: ampliar não pode
      // transformar cada nota numa bolha que cobre as linhas.
      const escalaPonto = Math.min(2, Math.max(0.6, camera.current.escala / ESCALA_BASE))

      for (const n of dados.nos) {
        const [px, py] = paraTela(n.x, n.y)
        const r = raioDe(n.grau) * escalaPonto
        const achado = termo !== '' && n.title.toLowerCase().includes(termo)
        const apagado = (alvo !== null && n.path !== alvo.path && !acesos?.has(n.path)) ||
          (termo !== '' && !achado)

        // Ponto chapado, sem halo. O halo da versão anterior fundia os nós
        // vizinhos numa mancha só, e a mancha escondia as linhas — que são
        // justamente o que esta tela existe para mostrar.
        ctx.globalAlpha = apagado ? 0.18 : 1
        ctx.fillStyle = corDe(n.path)
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // O nome só aparece de perto, no que está sob o cursor, e no que a
        // busca achou. Todos de uma vez seria uma parede de texto.
        const mostrarNome = n.path === alvo?.path || achado ||
          (camera.current.escala > ESCALA_BASE * 2.2 && n.grau > 0)
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
      // Enquadra uma vez, quando a simulação já assentou o bastante para o
      // tamanho não mudar mais. Enquadrar todo quadro daria uma tela que
      // respira sozinha e nunca para de se mexer.
      if (precisaEnquadrar.current && calor.current < 0.004) {
        enquadrar()
        precisaEnquadrar.current = false
      }
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
        // Alvo mínimo de 9 px: um nó de grau zero tem 2 px de raio, e acertar
        // isso com o mouse seria sorte.
        const alcance = Math.max(9, raioDe(n.grau) + 5)
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
      arrastando.current = { no: n, px, py }
      if (n) {
        n.preso = true
        // Reaquece: arrastar um nó tem de mexer a vizinhança dele, senão
        // parece que o grafo congelou.
        calor.current = Math.max(calor.current, CALOR_TOQUE)
      }
    }

    const aoMover = (e: PointerEvent): void => {
      const [px, py] = posicao(e)
      const arr = arrastando.current

      if (arr) {
        if (arr.no) {
          const [gx, gy] = paraGrafo(px, py)
          arr.no.x = gx
          arr.no.y = gy
        } else {
          // Arrasto no vazio move a câmera. Dividido pela escala porque o
          // deslocamento do dedo é em pixels e a câmera vive no espaço do
          // grafo — sem isso o mundo escorrega mais rápido que o dedo.
          camera.current.x -= (px - arr.px) / camera.current.escala
          camera.current.y -= (py - arr.py) / camera.current.escala
          arr.px = px
          arr.py = py
        }
        return
      }

      const n = noPonto(px, py)
      setSobre(atual => (atual?.path === n?.path ? atual : n))
      canvas.style.cursor = n ? 'pointer' : 'grab'
    }

    const aoSubir = (e: PointerEvent): void => {
      const arr = arrastando.current
      if (arr?.no) {
        // Solta o nó de volta para a física. Sem isto ele ficaria pregado
        // onde o dedo largou, e a rede perderia o equilíbrio aos poucos.
        arr.no.preso = false
        calor.current = Math.max(calor.current, CALOR_TOQUE)
      }
      arrastando.current = null
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
      camera.current.escala = Math.min(
        8000, Math.max(80, camera.current.escala * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
      )
      // Corrige o centro para o ponto sob o cursor não escorregar — sem isto
      // o zoom afasta justamente do que a pessoa está olhando.
      const depois = paraGrafo(px, py)
      camera.current.x += antes[0] - depois[0]
      camera.current.y += antes[1] - depois[1]
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
          onClick={() => {
            calor.current = CALOR_INICIAL
            precisaEnquadrar.current = true
          }}
          title="Sacudir a rede e reenquadrar"
        >
          Reorganizar
        </button>
      </div>

      {erro && <div className="aviso aviso-erro">{erro}</div>}

      <div className="cerebro-tela">
        <canvas ref={canvasRef} />

        {/* A legenda é o que torna a cor legível. Sem ela são sete cores;
            com ela, são sete pastas. */}
        {legenda.length > 0 && (
          <div className="cerebro-legenda">
            {legenda.map(g => (
              <span key={g.nome} className="cerebro-grupo">
                <i style={{ background: g.cor }} />
                {g.nome} <b>{g.quantas}</b>
              </span>
            ))}
          </div>
        )}

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
