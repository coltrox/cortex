import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * O vault inteiro como rede: um ponto por nota, uma linha por ligação.
 *
 * ## Os botões ficam com o dono
 *
 * Força, tamanho de ponto, espessura de linha e cor são AJUSTES, e não
 * constantes escolhidas por quem escreveu o arquivo. A razão é prática: cada
 * vault tem uma topologia, e o que fica bom num fica apertado no outro. Em
 * vez de calibrar de fora a cada pedido, a tela entrega os controles — e
 * guarda o que a pessoa escolheu.
 *
 * ## Canvas, e não SVG
 *
 * São ~130 nós e centenas de arestas redesenhados 60 vezes por segundo. Em
 * SVG isso é mexer em centenas de elementos do DOM por quadro; em canvas é um
 * laço de desenho.
 *
 * ## Por que não uma biblioteca de grafo
 *
 * O que sobraria do `d3-force` aqui é o laço de integração, que são vinte
 * linhas — e `d3` inteiro pesa mais do que o resto desta tela.
 */

type No = {
  /** A chave. Caminho de arquivo só quando `especie` é `nota`. */
  id: string
  title: string
  especie: 'nota' | 'tag' | 'inexistente'
  /** Decide a cor. Vem pronto da consulta — ver `grafoDoVault`. */
  grupo: string
  grau: number
  x: number
  y: number
  /** Deslocamento acumulado no quadro; zerado a cada passo. */
  dx: number
  dy: number
  /**
   * Preso pelo dedo: a física não mexe nele enquanto está sendo arrastado.
   *
   * Só durante o arrasto. Ao soltar, o nó volta para a física e é puxado de
   * volta devagar — ver `PASSOS_RETORNO`.
   */
  preso: boolean
}

type Aresta = { de: string; para: string }

/**
 * As cores padrão, por GRUPO.
 *
 * Grupo é a pasta de primeiro nível para as notas, mais `#tags` e
 * `(inexistente)` para as duas espécies que não são arquivo. Quem decide o
 * grupo é a consulta, não esta tela — ver `grafoDoVault`.
 *
 * São só o ponto de partida: o dono troca qualquer uma no painel, e a escolha
 * fica guardada. Colorir por grupo, e não por tipo de nota, porque quase toda
 * nota é do tipo `nota` — por tipo, o grafo saía de uma cor só.
 */
const CORES_PADRAO: Record<string, string> = {
  Dev: '#5b9bf0',
  Saude: '#4fc98a',
  Estudos: '#e8615f',
  Vida: '#a77df5',
  Grana: '#eab13f',
  Agenda: '#ec74b4',
  Diario: '#8b939e',
  // As duas espécies que não são pasta. Verde para etiqueta, como no grafo
  // que o dono já usava; cinza apagado para a nota que ainda não existe —
  // ela é ausência, e não pode competir de igual para igual com o que existe.
  '#tags': '#5fbf7a',
  '(inexistente)': '#6a7078'
}
const COR_PADRAO = '#a8b0ba'

/**
 * A área nominal do desenho, em coordenadas do grafo.
 *
 * Não é moldura — nada impede um nó de sair dela. Serve para uma conta só:
 * repartir o espaço entre os nós e obter a distância de equilíbrio. Quanto
 * mais notas, mais perto uma da outra, e o enquadramento cuida do resto.
 */
const AREA = 0.6

/** A escala em que os pontos têm o tamanho de desenho. */
const ESCALA_BASE = 600

/**
 * Quanto da força vira movimento a cada quadro.
 *
 * Este número foi a causa de um defeito que demorou a achar: a rede tremia
 * inteira no instante em que se clicava num nó, e de novo ao soltar.
 *
 * A versão anterior andava `min(|força|, teto)` — um passo de tamanho FIXO na
 * direção da força. Perto do equilíbrio isso é taxa de aprendizado 1: o nó
 * passa do ponto, volta, passa de novo, e a simulação nunca assenta. Ela
 * parava só porque a temperatura acabava, e parava LONGE do equilíbrio: a
 * força residual média ficava em 0,015, com picos de 0,16. Bastava reaquecer
 * — o que eu fazia ao clicar — para cada nó saltar uns 9 px de uma vez.
 *
 * Com o passo proporcional à força, a coisa converge de verdade. Medido
 * neste vault, com 2000 passos: força média 0,0002, e o maior salto ao
 * reaquecer cai de 12 px para 0,01 px. Acima de 0,08 volta a oscilar e nunca
 * assenta — 0,03 tem margem folgada.
 */
const ETA = 0.03

/**
 * O teto de deslocamento por quadro.
 *
 * Só morde quando a rede está embaralhada — logo depois de "Reorganizar", por
 * exemplo. Sem ele o primeiro quadro atira os nós para longe, porque as
 * forças começam enormes.
 */
const PASSO_MAX = 0.02

/**
 * O passo enquanto um nó está sendo ARRASTADO.
 *
 * Muito menor que o normal, e é o que conserta a bagunça de puxar um nó com
 * vinte ligações: com o passo cheio, cada vizinho recebe uma força enorme —
 * o nó saiu do lugar de repouso dele — e salta no teto a cada quadro. Vinte
 * vizinhos saltando ao mesmo tempo é o remexer que se via.
 *
 * Assim eles ACOMPANHAM: andam na direção certa, um pouco mais devagar que o
 * dedo, e o conjunto se deforma em vez de se sacudir.
 */
const ETA_ARRASTO = 0.010
const PASSO_MAX_ARRASTO = 0.003

/*
 * A simulação anda por QUADROS CONTADOS, e não por temperatura que decai.
 *
 * Com o passo proporcional à força (`ETA`), a energia já cai sozinha: perto
 * do equilíbrio o movimento tende a zero sem precisar de nada que o force. O
 * que sobra a decidir é POR QUANTO TEMPO deixar rodar, e isso é uma contagem
 * de quadros — que se lê direto ("noventa quadros são um segundo e meio") em
 * vez de sair de um decaimento exponencial.
 *
 * É também o que dá a volta PARCIAL do nó solto: acabam os quadros, para
 * onde estiver.
 */

/** Quadros para assentar do zero. Convergido: ver a medição em `ETA`. */
const PASSOS_ANTES = 1500

/**
 * Quadros depois de soltar um nó arrastado.
 *
 * Um segundo e meio. O nó é puxado de volta na direção de onde saiu e para
 * no meio do caminho, quando os quadros acabam — o ímã fraco do Obsidian.
 * Devolver ao repouso na hora o deixaria pregado onde o dedo largou; deixar
 * rodar até convergir o traria inteiro de volta, como se nada tivesse
 * acontecido.
 */
const PASSOS_RETORNO = 90

/** Quadros depois de mexer num controle: tempo de o desenho responder. */
const PASSOS_AJUSTE = 400

/** Quadros por quadro enquanto se arrasta — mantém a vizinhança viva. */
const PASSOS_ARRASTO = 2

/** Quanto o cursor precisa ficar parado para o realce pesado entrar, em ms. */
const ATRASO_FOCO = 420

/** Quantos pixels o dedo pode escorregar e ainda ser um clique. */
const FOLGA_CLIQUE = 4

/** Quanto tempo a animação de construção leva para revelar tudo, em ms. */
const DURACAO_ANIMACAO = 9000

/**
 * Quanto da distância até o zoom alvo se percorre por quadro.
 *
 * A roda do mouse chega aos trancos — um evento por entalhe —, e aplicar
 * cada um direto na escala fazia o desenho pular de degrau em degrau. Aqui a
 * roda só move o ALVO, e a escala caminha até ele.
 *
 * 0,18 por quadro dá uns 15 quadros para cobrir quase toda a distância: um
 * quarto de segundo. Rápido o bastante para não parecer atraso, lento o
 * bastante para o olho acompanhar o movimento em vez de ver um corte.
 */
const SUAVIDADE_ZOOM = 0.18

/**
 * Quanto a escala muda por entalhe da roda.
 *
 * 1,35 — um terço a mais por giro. Com o passo anterior era preciso rolar
 * muito para chegar perto de alguma coisa, e o gesto virava trabalho.
 */
const PASSO_ZOOM = 1.35

/** O que o dono pode ajustar na tela. */
type Ajustes = {
  /** Multiplicador do raio do ponto. */
  tamanhoNo: number
  /** Multiplicador da espessura da linha. */
  espessuraLinha: number
  /** 0 = nome só sob o cursor; 1 = nome sempre. */
  limiarNome: number
  /** Gravidade para o centro. */
  forcaCentro: number
  /** Repulsão entre todos os pares. */
  forcaRepulsao: number
  /** Atração ao longo dos links. */
  forcaLink: number
  /** Multiplicador do comprimento de repouso do link. */
  distanciaLink: number
  /** Mostrar as etiquetas como nós. */
  mostrarTags: boolean
  /** Mostrar as notas citadas que ainda não existem. */
  mostrarInexistentes: boolean
  /** Mostrar o que não tem ligação nenhuma. */
  mostrarSoltas: boolean
  /** Cor por grupo. O que não estiver aqui usa o padrão. */
  cores: Record<string, string>
}

/*
 * Os valores de partida.
 *
 * Saíram de uma varredura sobre este vault (133 notas, 392 ligações) medindo
 * três coisas: quão redonda fica a nuvem (proporção da caixa 1,00), quão
 * uniforme é o espaçamento (variação da distância ao vizinho 0,11) e quanto o
 * link ainda organiza (nós ligados a 0,30 da distância média entre dois nós
 * quaisquer).
 *
 * O terceiro número é o que impede a uniformidade barata: um disco aleatório
 * também tem espaçamento regular, e não diz nada. Medir a distância entre
 * LIGADOS é o que prova que o desenho ficou regular sem deixar de ser o
 * desenho deste vault.
 */
const AJUSTES_PADRAO: Ajustes = {
  tamanhoNo: 1,
  espessuraLinha: 1,
  limiarNome: 0.35,
  forcaCentro: 2.2,
  forcaRepulsao: 1.5,
  forcaLink: 0.1,
  distanciaLink: 1,
  mostrarTags: true,
  mostrarInexistentes: true,
  mostrarSoltas: true,
  cores: {}
}

const CHAVE_AJUSTES = 'cortex.cerebro.ajustes'

/**
 * Lê os ajustes guardados, campo a campo.
 *
 * Nunca confia no que está no disco: `localStorage` é texto que qualquer
 * coisa pode ter escrito, e uma versão futura pode ter gravado outro formato.
 * Campo que não for número vira o padrão, em vez de virar `NaN` e apagar o
 * grafo inteiro.
 */
function lerAjustes(): Ajustes {
  try {
    const bruto = window.localStorage.getItem(CHAVE_AJUSTES)
    if (!bruto) return AJUSTES_PADRAO
    const o = JSON.parse(bruto) as Partial<Ajustes>
    const num = (v: unknown, padrao: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : padrao
    const cores: Record<string, string> = {}
    if (o.cores && typeof o.cores === 'object') {
      for (const [k, v] of Object.entries(o.cores)) {
        // Só o formato `#rrggbb`. Um valor livre aqui iria direto para
        // `fillStyle`, e uma string torta pinta o canvas inteiro de preto.
        if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) cores[k] = v
      }
    }
    return {
      tamanhoNo: num(o.tamanhoNo, AJUSTES_PADRAO.tamanhoNo),
      espessuraLinha: num(o.espessuraLinha, AJUSTES_PADRAO.espessuraLinha),
      limiarNome: num(o.limiarNome, AJUSTES_PADRAO.limiarNome),
      forcaCentro: num(o.forcaCentro, AJUSTES_PADRAO.forcaCentro),
      forcaRepulsao: num(o.forcaRepulsao, AJUSTES_PADRAO.forcaRepulsao),
      forcaLink: num(o.forcaLink, AJUSTES_PADRAO.forcaLink),
      distanciaLink: num(o.distanciaLink, AJUSTES_PADRAO.distanciaLink),
      // Booleano guardado: só `false` desliga. Qualquer outra coisa no
      // disco — string, número, ausência — cai no padrão, que é mostrar.
      mostrarTags: o.mostrarTags !== false,
      mostrarInexistentes: o.mostrarInexistentes !== false,
      mostrarSoltas: o.mostrarSoltas !== false,
      cores
    }
  } catch {
    // Disco ilegível, JSON quebrado, armazenamento desligado: o padrão serve.
    return AJUSTES_PADRAO
  }
}

/** Raio do ponto pelo grau. Raiz, senão um nó com 30 links engole a tela. */
const raioDe = (grau: number): number => 2.2 + Math.sqrt(grau) * 1.3

/**
 * O espaçamento para o qual os raios de `raioDe` foram desenhados.
 *
 * Medido neste vault quando ele tinha só notas: os vizinhos mais próximos
 * ficavam a 25 px na escala 600, ou seja, 0,042 em coordenadas do grafo.
 *
 * Serve para uma coisa: quando a rede fica mais densa — e ela ficou, ao
 * ganhar as 151 etiquetas —, os nós se aproximam e o ponto do MESMO tamanho
 * passa a cobrir o vizinho. Comparando o espaçamento de agora com este, o
 * ponto encolhe na mesma proporção e a tela continua legível com qualquer
 * número de notas.
 */
const ESPACAMENTO_BASE = 0.042

export function Cerebro({ aoAbrir }: { aoAbrir: (path: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [dados, setDados] = useState<{ nos: No[]; arestas: Aresta[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState<No | null>(null)
  const [busca, setBusca] = useState('')
  const [ajustes, setAjustes] = useState<Ajustes>(lerAjustes)
  const [painel, setPainel] = useState(false)

  /*
   * O que muda 60 vezes por segundo mora em `ref`, e não em `useState`.
   *
   * Posição de nó e câmera mudam a cada quadro. Em `useState`, cada quadro
   * seria uma renderização do React inteira — para desenhar num canvas que o
   * React nem controla.
   *
   * `sobre`, `busca` e `ajustes` também viram `ref` por um motivo mais
   * concreto: eles estavam nas dependências do efeito que monta o canvas, e
   * por isso CADA movimento do mouse desmontava e remontava todos os ouvintes
   * de evento da tela.
   */
  const camera = useRef({ x: 0.5, y: 0.5, escala: ESCALA_BASE })
  /** Para onde a escala está indo. A câmera persegue — ver `seguirZoom`. */
  const alvoEscala = useRef(ESCALA_BASE)
  /** Que ponto do grafo tem de continuar sob o cursor durante o zoom. */
  const ancora = useRef<{ gx: number; gy: number; px: number; py: number } | null>(null)
  /**
   * Quadros em que a física anda DEVAGAR — ver `ETA_ARRASTO`.
   *
   * Vale enquanto se arrasta e continua valendo na volta, depois de soltar.
   * Sem isso o passo saltava de 0,003 para 0,02 no instante em que o dedo
   * levantava: seis vezes e meia maior no mesmo quadro, e a rede dava um
   * tranco. Puxar tinha sido consertado; soltar, não.
   */
  const suaves = useRef(0)

  /** Quantos quadros de simulação ainda faltam rodar. Zero = rede parada. */
  const restantes = useRef(PASSOS_ANTES)
  const buscaRef = useRef('')
  const ajustesRef = useRef(ajustes)
  buscaRef.current = busca
  ajustesRef.current = ajustes

  /*
   * PASSAR o mouse e DEIXAR o mouse são dois gestos diferentes.
   *
   * Passar por cima mostra o nome e contorna o ponto. Apagar o resto da rede
   * é resposta pesada demais para quem só atravessou a tela com o cursor: o
   * grafo inteiro pisca a cada movimento, e o que devia ajudar a enxergar
   * acaba cegando.
   *
   * Deixar parado é outra intenção — aí a pergunta é "e este aqui, liga em
   * quê?", e é aí que o resto apaga.
   */
  const sobreRef = useRef<No | null>(null)
  const focadoRef = useRef<No | null>(null)

  const arrastando = useRef<{
    no: No | null
    px: number; py: number
    ox: number; oy: number
    mexeu: boolean
  } | null>(null)

  /** Enquadra assim que a simulação assentar. */
  const precisaEnquadrar = useRef(true)
  /** A animação de construção: quantos nós já apareceram. */
  const animacao = useRef<{ ativa: boolean; comeco: number }>({ ativa: false, comeco: 0 })

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

  /** Guarda os ajustes a cada mudança. Falha em silêncio: é preferência. */
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(ajustes))
    } catch { /* armazenamento cheio ou desligado; a tela funciona igual */ }
  }, [ajustes])

  /** O atraso do realce pesado — ver `sobreRef`/`focadoRef`. */
  useEffect(() => {
    if (!sobre) { focadoRef.current = null; return }
    const t = setTimeout(() => { focadoRef.current = sobre }, ATRASO_FOCO)
    return () => clearTimeout(t)
  }, [sobre])

  /**
   * O que de fato entra no desenho, depois dos filtros.
   *
   * A consulta traz tudo — notas, etiquetas e o que ainda não existe. Quem
   * escolhe é esta tela, e a escolha muda o LAYOUT: tirar 151 etiquetas de
   * uma rede de 305 nós rearranja o resto. Por isso é um `useMemo` do qual
   * o efeito do canvas depende, e não um `if` dentro do laço de desenho.
   */
  const grafo = useMemo(() => {
    if (!dados) return null
    const fora = new Set<string>()
    for (const n of dados.nos) {
      if (!ajustes.mostrarTags && n.especie === 'tag') fora.add(n.id)
      if (!ajustes.mostrarInexistentes && n.especie === 'inexistente') fora.add(n.id)
    }
    let nos = dados.nos.filter(n => !fora.has(n.id))
    const arestas = dados.arestas.filter(a => !fora.has(a.de) && !fora.has(a.para))

    /*
     * As soltas saem por ÚLTIMO, e contando de novo.
     *
     * Um nó pode ficar solto por causa do próprio filtro — uma nota cuja
     * única ligação era uma etiqueta que acabou de sair. Usar o `grau` que
     * veio da consulta esconderia isso, porque lá ele foi contado com tudo
     * ligado.
     */
    if (!ajustes.mostrarSoltas) {
      const temLigacao = new Set<string>()
      for (const a of arestas) { temLigacao.add(a.de); temLigacao.add(a.para) }
      nos = nos.filter(n => temLigacao.has(n.id))
    }
    return { nos, arestas }
  }, [dados, ajustes.mostrarTags, ajustes.mostrarInexistentes, ajustes.mostrarSoltas])

  /** Índice de vizinhos, para acender o que está ligado ao nó focado. */
  const vizinhos = useMemo(() => {
    const m = new Map<string, Set<string>>()
    if (!grafo) return m
    for (const a of grafo.arestas) {
      if (!m.has(a.de)) m.set(a.de, new Set())
      if (!m.has(a.para)) m.set(a.para, new Set())
      m.get(a.de)?.add(a.para)
      m.get(a.para)?.add(a.de)
    }
    return m
  }, [grafo])

  /**
   * A ordem em que os nós aparecem na animação.
   *
   * Do mais ligado para o menos: a rede cresce a partir dos seus centros, que
   * é como ela de fato se formou. Por ordem alfabética, apareceriam pedaços
   * soltos sem relação — bonito de ver e sem sentido nenhum.
   */
  const ordemAnimacao = useMemo(() => {
    if (!grafo) return new Map<string, number>()
    const ordenados = [...grafo.nos].sort((a, b) => b.grau - a.grau)
    return new Map(ordenados.map((n, i) => [n.id, i]))
  }, [grafo])

  /** As pastas presentes, para a legenda e para o seletor de cor. */
  const grupos = useMemo(() => {
    if (!grafo) return []
    const conta = new Map<string, number>()
    for (const n of grafo.nos) {
      conta.set(n.grupo, (conta.get(n.grupo) ?? 0) + 1)
    }
    return [...conta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, quantas]) => ({ nome, quantas }))
  }, [grafo])

  const corDaPasta = useCallback(
    (pasta: string): string => ajustes.cores[pasta] ?? CORES_PADRAO[pasta] ?? COR_PADRAO,
    [ajustes.cores]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grafo) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const porId = new Map(grafo.nos.map(n => [n.id, n]))
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
    const aoRedimensionar = (): void => { dimensionar(); precisaEnquadrar.current = true }
    window.addEventListener('resize', aoRedimensionar)

    /** Câmera simples: um centro e uma escala em pixels por unidade. */
    const paraTela = (x: number, y: number): [number, number] => [
      (x - camera.current.x) * camera.current.escala + l / 2,
      (y - camera.current.y) * camera.current.escala + a / 2
    ]
    const paraGrafo = (px: number, py: number): [number, number] => [
      (px - l / 2) / camera.current.escala + camera.current.x,
      (py - a / 2) / camera.current.escala + camera.current.y
    ]

    /** Ajusta a câmera para tudo caber, com uma folga curta nas beiradas. */
    const enquadrar = (): void => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const n of grafo.nos) {
        if (n.x < x0) x0 = n.x
        if (n.y < y0) y0 = n.y
        if (n.x > x1) x1 = n.x
        if (n.y > y1) y1 = n.y
      }
      if (!Number.isFinite(x0)) return
      camera.current.x = (x0 + x1) / 2
      camera.current.y = (y0 + y1) / 2
      const largura = Math.max(1e-6, x1 - x0)
      const altura = Math.max(1e-6, y1 - y0)
      // 0,95, e não 0,86: com folga demais o grafo fica pequeno no meio de um
      // painel grande, e sobra moldura escura dos dois lados.
      camera.current.escala = Math.min(l / largura, a / altura) * 0.95
      // O alvo acompanha, senão o próximo giro da roda puxa a escala de
      // volta para o valor de antes do enquadramento.
      alvoEscala.current = camera.current.escala
      ancora.current = null
    }

    const k = Math.sqrt(AREA / Math.max(1, grafo.nos.length))

    /**
     * O espaçamento típico da rede, em coordenadas do grafo.
     *
     * A MEDIANA da distância ao vizinho mais próximo, e não a média: um
     * punhado de nós grudados puxaria a média para baixo e encolheria todos
     * os pontos por causa de uns poucos.
     *
     * Preenchida depois do assentamento — antes disso as posições ainda são
     * a espiral inicial e não dizem nada.
     */
    let espacamento = ESPACAMENTO_BASE
    const medirEspacamento = (): void => {
      const nos = grafo.nos
      if (nos.length < 2) return
      const perto: number[] = []
      for (let i = 0; i < nos.length; i++) {
        let menor = Infinity
        for (let j = 0; j < nos.length; j++) {
          if (i === j) continue
          const d = Math.hypot(nos[i].x - nos[j].x, nos[i].y - nos[j].y)
          if (d < menor) menor = d
        }
        if (Number.isFinite(menor)) perto.push(menor)
      }
      if (perto.length === 0) return
      perto.sort((x, y) => x - y)
      espacamento = perto[Math.floor(perto.length / 2)] || ESPACAMENTO_BASE
    }

    const passo = (): void => {
      // Modo suave: a rede acompanha em vez de se sacudir. Vale no arrasto e
      // na volta depois de soltar. Ver `ETA_ARRASTO`.
      const suave = suaves.current > 0
      const eta = suave ? ETA_ARRASTO : ETA
      const teto = suave ? PASSO_MAX_ARRASTO : PASSO_MAX
      if (suave) suaves.current--
      const nos = grafo.nos
      const aj = ajustesRef.current
      // O comprimento de repouso do link. Maior = links mais compridos.
      const kLink = k * Math.max(0.05, aj.distanciaLink)

      // Deslocamento, e não velocidade: cada quadro parte do zero, e por isso
      // não há energia acumulada para o grafo explodir.
      for (const n of nos) { n.dx = 0; n.dy = 0 }

      /*
       * Repulsão entre todos os pares: k³/d².
       *
       * `1/d²` e não `1/d` (o Fruchterman-Reingold clássico) por um motivo
       * que não é gosto: com `1/d`, o empurrão para fora dentro de uma nuvem
       * uniforme cresce linearmente com o raio — exatamente como a gravidade.
       * Duas forças com a mesma lei não se equilibram, uma vence sempre, e o
       * resultado é ou tudo espremido no centro ou tudo espalhado sem fim.
       *
       * O(n²), e de propósito: ~130 nós dão 8 mil pares por quadro, menos de
       * um milissegundo. Barnes-Hut só compensaria acima de alguns milhares.
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
           * Com `1/d²`, dois nós muito próximos geram uma força enorme e um
           * chuta o outro para o outro lado da tela. O piso é um décimo da
           * distância de equilíbrio: perto o bastante para nunca atrapalhar,
           * longe o bastante para a força não explodir.
           */
          const piso = k * 0.1
          if (d < piso) {
            if (d < 1e-9) {
              ex = (Math.random() - 0.5) * piso
              ey = (Math.random() - 0.5) * piso
            }
            d = piso
          }
          const f = (aj.forcaRepulsao * k * k * k) / (d * d)
          const fx = (ex / d) * f
          const fy = (ey / d) * f
          A.dx -= fx; A.dy -= fy
          B.dx += fx; B.dy += fy
        }
      }

      // Atração ao longo dos links: cresce com a distância, então dois nós
      // ligados nunca ficam em cantos opostos da tela.
      for (const e of grafo.arestas) {
        const A = porId.get(e.de)
        const B = porId.get(e.para)
        if (!A || !B) continue
        const ex = B.x - A.x
        const ey = B.y - A.y
        const d = Math.hypot(ex, ey) || 1e-6
        const f = (aj.forcaLink * d * d) / kLink
        const fx = (ex / d) * f
        const fy = (ey / d) * f
        A.dx += fx; A.dy += fy
        B.dx -= fx; B.dy -= fy
      }

      // A gravidade. Cresce com a distância, então mal se nota no miolo e
      // segura firme quem tenta escapar para longe.
      for (const n of nos) {
        n.dx += (0.5 - n.x) * aj.forcaCentro
        n.dy += (0.5 - n.y) * aj.forcaCentro
      }

      for (const n of nos) {
        if (n.preso) continue
        // O passo é limitado pela temperatura: é ela que impede um salto
        // gigante no primeiro quadro, quando tudo ainda está amontoado.
        const d = Math.hypot(n.dx, n.dy)
        if (d > 1e-9) {
          // Proporcional a forca, e nao um passo fixo: e isto que faz a
          // simulacao assentar em vez de oscilar em volta do equilibrio.
          const anda = Math.min(d * eta, teto)
          n.x += (n.dx / d) * anda
          n.y += (n.dy / d) * anda
        }
      }

    }

    /*
     * Resolve antes de mostrar.
     *
     * Sem isto a tela abria com tudo amontoado e sacudindo até assentar. O
     * laço abaixo faz o mesmo trabalho sem ninguém ver, e a rede já aparece
     * arranjada e PARADA.
     */
    for (let i = 0; i < PASSOS_ANTES; i++) passo()
    medirEspacamento()
    restantes.current = 0
    enquadrar()
    precisaEnquadrar.current = false

    const desenhar = (): void => {
      ctx.clearRect(0, 0, l, a)

      const aj = ajustesRef.current
      // Quem apaga o resto é o FOCADO (mouse parado), nunca o que está só sob
      // o cursor de passagem.
      const alvo = focadoRef.current
      const sobCursor = sobreRef.current
      const acesos = alvo ? vizinhos.get(alvo.id) ?? new Set<string>() : null
      const termo = buscaRef.current.trim().toLowerCase()

      /*
       * A animação de construção.
       *
       * `visivel` responde se o nó já entrou. Fora da animação, todos
       * entraram — a mesma função serve para os dois casos, em vez de duas
       * versões do laço de desenho.
       */
      const an = animacao.current
      const revelados = an.ativa
        ? (performance.now() - an.comeco) / DURACAO_ANIMACAO * grafo.nos.length
        : Infinity
      if (an.ativa && revelados > grafo.nos.length + 1) an.ativa = false
      const visivel = (n: No): boolean => (ordemAnimacao.get(n.id) ?? 0) < revelados

      // As arestas primeiro, para os nós ficarem por cima.
      ctx.lineWidth = Math.max(0.3, aj.espessuraLinha)
      for (const e of grafo.arestas) {
        const A = porId.get(e.de)
        const B = porId.get(e.para)
        if (!A || !B) continue
        // Na animação, a linha só aparece quando as DUAS pontas existirem —
        // é o que faz a rede parecer se costurando, e não riscos no vazio.
        if (!visivel(A) || !visivel(B)) continue
        const ligada = alvo !== null && (e.de === alvo.id || e.para === alvo.id)
        ctx.strokeStyle = ligada
          ? 'rgba(160,205,245,.85)'
          : alvo
            ? 'rgba(150,158,170,.07)'
            : 'rgba(150,158,170,.34)'
        const [ax, ay] = paraTela(A.x, A.y)
        const [bx, by] = paraTela(B.x, B.y)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }
      ctx.lineWidth = 1

      // O ponto cresce com o zoom, mas devagar e com teto: ampliar não pode
      // transformar cada nota numa bolha que cobre as linhas.
      /*
       * O ponto encolhe quando a rede adensa.
       *
       * Sem isto, ganhar as 151 etiquetas aproximou os nós e o ponto do
       * mesmo tamanho passou a cobrir o vizinho — o desenho virou aglomerado.
       * Comparando o espaçamento medido com aquele para o qual os raios
       * foram desenhados, o ponto acompanha a densidade sozinho.
       */
      const densidade = Math.min(1, espacamento / ESPACAMENTO_BASE)
      const escalaPonto = Math.min(1.5, Math.max(0.6, camera.current.escala / ESCALA_BASE))
        * densidade * Math.max(0.1, aj.tamanhoNo)

      /** Candidatos a rótulo, resolvidos depois dos pontos. */
      const rotulos: { n: No; px: number; py: number; r: number; peso: number }[] = []
      // Acima de que escala todo nome aparece. `limiarNome` 1 = sempre.
      const escalaDoNome = ESCALA_BASE * (4 - Math.min(1, Math.max(0, aj.limiarNome)) * 3.9)

      for (const n of grafo.nos) {
        if (!visivel(n)) continue
        const [px, py] = paraTela(n.x, n.y)
        const r = raioDe(n.grau) * escalaPonto
        const achado = termo !== '' && n.title.toLowerCase().includes(termo)
        const apagado = (alvo !== null && n.id !== alvo.id && !acesos?.has(n.id)) ||
          (termo !== '' && !achado)

        ctx.globalAlpha = apagado ? 0.18 : 1
        ctx.fillStyle = aj.cores[n.grupo] ?? CORES_PADRAO[n.grupo] ?? COR_PADRAO
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()

        // Contorno claro no que está sob o cursor: o realce LEVE do passar de
        // mouse. Diz "é este" sem mexer em mais nada da tela.
        if (n === sobCursor) {
          ctx.strokeStyle = 'rgba(255,255,255,.92)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(px, py, r + 2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = 1
        }

        ctx.globalAlpha = 1

        if (apagado) continue
        const querNome = n === sobCursor || n.id === alvo?.id || achado ||
          camera.current.escala > escalaDoNome
        // O peso decide quem ganha quando dois nomes brigam pelo mesmo
        // espaço: primeiro o que está sob o cursor, depois o que a busca
        // achou, e por último o mais ligado.
        if (querNome) {
          const peso = n === sobCursor ? 1e9 : achado ? 1e6 : n.grau
          rotulos.push({ n, px, py, r, peso })
        }
      }

      /*
       * Os nomes, sem deixar um por cima do outro.
       *
       * Antes todos eram desenhados na ordem dos nós, e nomes de notas
       * vizinhas se sobrepunham — parecia nota duplicada. Agora quem tem mais
       * peso desenha primeiro, e quem chegaria em cima de um já desenhado
       * simplesmente não aparece.
       */
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(244,247,250,.96)'
      const ocupados: [number, number, number, number][] = []
      rotulos.sort((x, y) => y.peso - x.peso)
      for (const rot of rotulos) {
        const larg = ctx.measureText(rot.n.title).width
        const cx = rot.px
        const cy = rot.py - rot.r - 7
        const caixa: [number, number, number, number] =
          [cx - larg / 2 - 2, cy - 11, larg + 4, 14]
        const bate = ocupados.some(o =>
          caixa[0] < o[0] + o[2] && caixa[0] + caixa[2] > o[0] &&
          caixa[1] < o[1] + o[3] && caixa[1] + caixa[3] > o[1])
        if (bate) continue
        ocupados.push(caixa)
        ctx.fillText(rot.n.title, cx, cy)
      }
    }

    const laco = (): void => {
      // Rede parada nao gasta quadro de fisica: o desenho continua (o
      // cursor e o zoom precisam dele), o `passo` nao.
      seguirZoom()
      if (restantes.current > 0) { passo(); restantes.current-- }
      if (precisaEnquadrar.current && restantes.current === 0) {
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
      // A MESMA conta do desenho, densidade inclusive: se o alvo do dedo
      // divergir do ponto desenhado, a pessoa acerta o que não está vendo.
      const densidade = Math.min(1, espacamento / ESPACAMENTO_BASE)
      const escalaPonto = Math.min(1.5, Math.max(0.6, camera.current.escala / ESCALA_BASE))
        * densidade * Math.max(0.1, ajustesRef.current.tamanhoNo)
      for (const n of grafo.nos) {
        const [nx, ny] = paraTela(n.x, n.y)
        const d = Math.hypot(px - nx, py - ny)
        // Alvo mínimo de 14 px: um nó pequeno tem 2 px de raio, e acertar
        // isso com o mouse seria sorte. Não muito mais do que isso: alvo
        // grande demais faz o cursor pegar o vizinho em vez do de baixo.
        const alcance = Math.max(14, raioDe(n.grau) * escalaPonto + 8)
        if (d < alcance && d < menor) { menor = d; achado = n }
      }
      return achado
    }

    const posicao = (e: PointerEvent | WheelEvent): [number, number] => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }

    const aoDescer = (e: PointerEvent): void => {
      /*
       * Sem isto o arrasto vira SELEÇÃO DE TEXTO.
       *
       * Arrastar sobre o canvas fazia o navegador selecionar o texto em
       * volta — a contagem, a legenda —, e o realce de seleção do Chromium
       * em fundo escuro é aquele roxo que piscava a cada clique. O CSS de
       * `.cerebro` também desliga a seleção; aqui é o cinto além do
       * suspensório, porque `preventDefault` no `pointerdown` é o que
       * impede o gesto de começar.
       */
      e.preventDefault()
      const [px, py] = posicao(e)
      const n = noPonto(px, py)
      canvas.setPointerCapture(e.pointerId)
      arrastando.current = { no: n, px, py, ox: px, oy: py, mexeu: false }
      // A mãozinha fechada é a única vez em que o cursor muda: ela diz que
      // ALGO está sendo segurado. Fora disso a seta basta, e trocar o cursor
      // a cada nó por que se passa deixa o ponteiro piscando pela tela.
      canvas.style.cursor = 'grabbing'
      if (n) { n.preso = true; suaves.current = PASSOS_RETORNO }
    }

    const aoMover = (e: PointerEvent): void => {
      const [px, py] = posicao(e)
      const arr = arrastando.current

      if (arr) {
        // Passou da folga? Então é arrasto, e não clique. A folga existe
        // porque a mão treme: sem ela, um clique com dois pixels de tremor
        // vira arrasto e a nota não abre.
        if (!arr.mexeu && Math.hypot(px - arr.ox, py - arr.oy) > FOLGA_CLIQUE) {
          arr.mexeu = true
        }
        if (arr.no) {
          const [gx, gy] = paraGrafo(px, py)
          arr.no.x = gx
          arr.no.y = gy
          // Um punhado de quadros a cada movimento: os vizinhos acompanham o
          // nó puxado em vez de ficarem congelados enquanto ele passeia. E o
          // modo suave é renovado, para não expirar no meio do arrasto.
          restantes.current = Math.max(restantes.current, PASSOS_ARRASTO)
          suaves.current = PASSOS_RETORNO
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
      sobreRef.current = n
      setSobre(atual => (atual?.id === n?.id ? atual : n))
    }

    const aoSubir = (e: PointerEvent): void => {
      const arr = arrastando.current
      if (arr?.no) {
        arr.no.preso = false
        if (arr.mexeu) {
          // Arrastou: o nó volta para a física por um tempo contado e é
          // puxado na direção de onde saiu — sem chegar inteiro, porque os
          // quadros acabam antes. Ver `PASSOS_RETORNO`.
          restantes.current = Math.max(restantes.current, PASSOS_RETORNO)
          // A volta usa o MESMO passo gentil do arrasto: é o que evita o
          // tranco no instante em que o dedo levanta.
          suaves.current = PASSOS_RETORNO
        } else {
          // Tag e nota inexistente não são arquivo: não há o que abrir.
          if (arr.no.especie === 'nota') aoAbrir(arr.no.id)
        }
      }
      arrastando.current = null
      canvas.style.cursor = 'default'
      canvas.releasePointerCapture(e.pointerId)
    }

    const aoSair = (): void => {
      sobreRef.current = null
      setSobre(null)
    }

    /*
     * O zoom não salta: ele PERSEGUE um alvo.
     *
     * Cada giro da roda mexia na escala na hora, e o desenho pulava de
     * degrau em degrau. Aqui a roda mexe só no alvo, e cada quadro caminha
     * uma fração da distância até ele — o resultado é contínuo mesmo com o
     * evento chegando aos trancos, e continua respondendo na hora, porque a
     * primeira fração é a maior.
     *
     * A âncora guarda que ponto do grafo estava sob o cursor. Enquanto a
     * escala caminha, a câmera é recolocada a cada quadro para esse ponto
     * continuar exatamente sob o mesmo pixel — sem isso o zoom afasta
     * justamente do que a pessoa está olhando.
     */
    const aoRolar = (e: WheelEvent): void => {
      e.preventDefault()
      const [px, py] = posicao(e)
      const [gx, gy] = paraGrafo(px, py)
      ancora.current = { gx, gy, px, py }
      alvoEscala.current = Math.min(
        9000, Math.max(60, alvoEscala.current * (e.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM))
      )
    }

    /** Caminha um passo da escala atual em direção ao alvo. */
    const seguirZoom = (): void => {
      const alvo = alvoEscala.current
      const atual = camera.current.escala
      if (Math.abs(alvo - atual) < atual * 0.001) {
        camera.current.escala = alvo
        return
      }
      camera.current.escala = atual + (alvo - atual) * SUAVIDADE_ZOOM
      const anc = ancora.current
      if (!anc) return
      // Recoloca a câmera para o ponto ancorado ficar sob o mesmo pixel.
      camera.current.x = anc.gx - (anc.px - l / 2) / camera.current.escala
      camera.current.y = anc.gy - (anc.py - a / 2) / camera.current.escala
    }

    canvas.addEventListener('pointerdown', aoDescer)
    canvas.addEventListener('pointermove', aoMover)
    canvas.addEventListener('pointerup', aoSubir)
    canvas.addEventListener('pointerleave', aoSair)
    canvas.addEventListener('wheel', aoRolar, { passive: false })

    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('resize', aoRedimensionar)
      canvas.removeEventListener('pointerdown', aoDescer)
      canvas.removeEventListener('pointermove', aoMover)
      canvas.removeEventListener('pointerup', aoSubir)
      canvas.removeEventListener('pointerleave', aoSair)
      canvas.removeEventListener('wheel', aoRolar)
    }
  }, [grafo, vizinhos, ordemAnimacao, aoAbrir])

  const mudar = <C extends keyof Ajustes>(campo: C, valor: Ajustes[C]): void => {
    setAjustes(a => ({ ...a, [campo]: valor }))
    // Mexer numa força tem de mexer o desenho: sem reaquecer, o grafo fica
    // parado e o controle parece quebrado.
    restantes.current = Math.max(restantes.current, PASSOS_AJUSTE)
    // No passo GENTIL: mexer num controle é ver o desenho mudar, e o desenho
    // mudando aos trancos não deixa comparar antes e depois. Com o passo
    // cheio a rede inteira se sacudia a cada arrasto do dedo no controle.
    suaves.current = Math.max(suaves.current, PASSOS_AJUSTE)
  }

  const ligados = grafo ? grafo.nos.filter(n => n.grau > 0).length : 0

  return (
    <div className="cerebro">
      <div className="cerebro-topo">
        <div className="cerebro-conta">
          {grafo
            ? <>
                <strong>{grafo.nos.length}</strong> notas
                <span className="sep">·</span>
                <strong>{grafo.arestas.length}</strong> ligações
                <span className="sep">·</span>
                {grafo.nos.length - ligados} soltas
              </>
            : 'lendo a rede…'}
        </div>

        {/* Busca e botões num grupo só: assim descem JUNTOS para a linha de
            baixo quando a janela aperta, em vez de a busca ficar órfã em
            cima e os botões embaixo. */}
        <div className="cerebro-acoes">
          <input
            className="cerebro-busca"
            type="search"
            value={busca}
            placeholder="acender uma nota"
            onChange={e => setBusca(e.target.value)}
          />

          <button
            className="btn-fantasma"
            onClick={() => { animacao.current = { ativa: true, comeco: performance.now() } }}
            title="Ver a rede se formando, do nó mais ligado ao menos"
          >
            Animar
          </button>

          <button
            className="btn-fantasma"
            onClick={() => {
              // Solta os nós presos e sacode. Sem isto, quem arrastasse
              // muita coisa não teria caminho de volta.
              for (const n of grafo?.nos ?? []) n.preso = false
              restantes.current = PASSOS_ANTES
              precisaEnquadrar.current = true
            }}
            title="Sacudir a rede e reenquadrar"
          >
            Reorganizar
          </button>

          <button
            className="btn-fantasma"
            aria-pressed={painel}
            onClick={() => setPainel(p => !p)}
            title="Ajustes do grafo"
          >
            Ajustes
          </button>
        </div>
      </div>

      {erro && <div className="aviso aviso-erro">{erro}</div>}

      <div className="cerebro-tela">
        <canvas ref={canvasRef} />

        {/* A legenda é o que torna a cor legível. Sem ela são sete cores;
            com ela, são sete pastas. */}
        {grupos.length > 0 && (
          <div className="cerebro-legenda">
            {grupos.map(g => (
              <span key={g.nome} className="cerebro-grupo">
                <i style={{ background: corDaPasta(g.nome) }} />
                {g.nome} <b>{g.quantas}</b>
              </span>
            ))}
          </div>
        )}

        {painel && (
          <div className="cerebro-painel">
            <div className="cerebro-painel-topo">
              <strong>Ajustes</strong>
              <button className="btn-icone" title="Fechar" onClick={() => setPainel(false)}>×</button>
            </div>

            <div className="cerebro-secao">O que aparece</div>
            <Chave nome="Etiquetas" ligado={ajustes.mostrarTags}
              aoMudar={v => mudar('mostrarTags', v)} />
            <Chave nome="Notas que ainda não existem" ligado={ajustes.mostrarInexistentes}
              aoMudar={v => mudar('mostrarInexistentes', v)} />
            <Chave nome="Sem ligação nenhuma" ligado={ajustes.mostrarSoltas}
              aoMudar={v => mudar('mostrarSoltas', v)} />

            <div className="cerebro-secao">Exibição</div>
            <Faixa nome="Tamanho do nó" valor={ajustes.tamanhoNo} min={0.3} max={3} passo={0.1}
              aoMudar={v => mudar('tamanhoNo', v)} />
            <Faixa nome="Espessura da linha" valor={ajustes.espessuraLinha} min={0.2} max={3} passo={0.1}
              aoMudar={v => mudar('espessuraLinha', v)} />
            <Faixa nome="Quando o nome aparece" valor={ajustes.limiarNome} min={0} max={1} passo={0.05}
              aoMudar={v => mudar('limiarNome', v)} />

            <div className="cerebro-secao">Forças</div>
            <Faixa nome="Força do centro" valor={ajustes.forcaCentro} min={0} max={6} passo={0.1}
              aoMudar={v => mudar('forcaCentro', v)} />
            <Faixa nome="Repulsão" valor={ajustes.forcaRepulsao} min={0.1} max={6} passo={0.1}
              aoMudar={v => mudar('forcaRepulsao', v)} />
            <Faixa nome="Força do link" valor={ajustes.forcaLink} min={0} max={1} passo={0.01}
              aoMudar={v => mudar('forcaLink', v)} />
            <Faixa nome="Distância do link" valor={ajustes.distanciaLink} min={0.3} max={3} passo={0.1}
              aoMudar={v => mudar('distanciaLink', v)} />

            <div className="cerebro-secao">Cores</div>
            {grupos.map(g => (
              <label key={g.nome} className="cerebro-cor">
                <input
                  type="color"
                  value={corDaPasta(g.nome)}
                  onChange={e => setAjustes(a => ({
                    ...a, cores: { ...a.cores, [g.nome]: e.target.value }
                  }))}
                />
                <span>{g.nome}</span>
                <b>{g.quantas}</b>
              </label>
            ))}

            <button
              className="btn-fantasma cerebro-restaurar"
              onClick={() => { setAjustes(AJUSTES_PADRAO); restantes.current = PASSOS_ANTES }}
            >
              Restaurar o padrão
            </button>
          </div>
        )}

        {sobre && (
          <div className="cerebro-nome">
            <strong>{sobre.title}</strong>
            <span>
              {sobre.especie === 'tag'
                ? 'etiqueta'
                // Dizer que a nota não existe é o dado mais útil aqui: é o
                // que separa "abre" de "ainda vou escrever".
                : sobre.especie === 'inexistente' ? 'ainda não existe' : sobre.grupo}
              {' · '}{sobre.grau} {sobre.grau === 1 ? 'ligação' : 'ligações'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Um interruptor com nome. */
function Chave({ nome, ligado, aoMudar }: {
  nome: string
  ligado: boolean
  aoMudar: (v: boolean) => void
}) {
  return (
    <label className="cerebro-chave">
      <input type="checkbox" checked={ligado} onChange={e => aoMudar(e.target.checked)} />
      <span>{nome}</span>
    </label>
  )
}

/** Um controle deslizante com nome e valor. */
function Faixa({ nome, valor, min, max, passo, aoMudar }: {
  nome: string
  valor: number
  min: number
  max: number
  passo: number
  aoMudar: (v: number) => void
}) {
  return (
    <label className="cerebro-faixa">
      <span className="cerebro-faixa-nome">
        {nome}
        {/* O número ao lado, e não só a barra: sem ele não há como repetir um
            ajuste que ficou bom, nem dizer a outra pessoa qual era. */}
        <b>{valor.toFixed(passo < 0.1 ? 2 : 1)}</b>
      </span>
      <input
        type="range"
        min={min} max={max} step={passo} value={valor}
        onChange={e => aoMudar(Number(e.target.value))}
      />
    </label>
  )
}
