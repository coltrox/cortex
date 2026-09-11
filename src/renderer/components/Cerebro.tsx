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
 * São ~300 nós e quase mil arestas redesenhados 60 vezes por segundo. Em SVG
 * isso é mexer em centenas de elementos do DOM por quadro; em canvas é um
 * laço de desenho.
 *
 * ## A física roda em arrays, e não em objetos
 *
 * A repulsão é O(n²): 305 nós dão 46 mil pares por passo. Com objetos e
 * `Math.hypot`, os 900 passos de assentamento custavam **8,8 segundos** de
 * tela travada — medido. Os mesmos 900 passos em `Float64Array`, trocando
 * `hypot` por `sqrt`, custam 400 ms: treze vezes mais rápido, e a conta é
 * exatamente a mesma (`hypot(a,b)` e `sqrt(a*a+b*b)` dão o mesmo número).
 *
 * Por isso as posições vivem em `px`/`py` enquanto o efeito está montado. Os
 * objetos `No` guardam identidade e metadados, e recebem a posição de volta
 * na desmontagem — é o que faz o layout sobreviver a trocar de lente.
 *
 * ## Nada acontece aos trancos
 *
 * Toda mudança de posição ou de câmera é interpolada: reorganizar, restaurar
 * o padrão, enquadrar, dar zoom, filtrar. Um salto instantâneo é sempre lido
 * como defeito, mesmo quando o destino está certo.
 */

type No = {
  /** A chave. Caminho de arquivo só quando `especie` é `nota`. */
  id: string
  title: string
  especie: 'nota' | 'tag' | 'inexistente' | 'centro'
  /** Decide a cor. Vem pronto da consulta — ver `grafoDoVault`. */
  grupo: string
  grau: number
  x: number
  y: number
}

type Aresta = { de: string; para: string }

type Bruto = { nos: Omit<No, 'x' | 'y'>[]; arestas: Aresta[] }

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

/** O centro para onde a gravidade puxa, e o centro da parede. */
const CENTRO = 0.5

/**
 * O nó do meio.
 *
 * Não vem do vault: é o vault. Fica cravado no centro, não entra na física e
 * liga em tudo — os raios saem dele para cada nó visível.
 *
 * Fora da física de propósito, e isso não é economia. Se ele entrasse, duas
 * coisas quebrariam de uma vez: a repulsão dele abriria um buraco no miolo
 * exatamente onde ele está, e a atração de trezentos links puxando para o
 * mesmo ponto colapsaria a nuvem inteira em cima dele. O desenho que o dono
 * aprovou some nos dois casos. Aqui ele é uma CAMADA por cima do layout, e o
 * layout continua sendo o do vault.
 */
/*
 * O id do centro não pode PARECER um id de verdade.
 *
 * Ele era `#cortex`, e isso colidiu de frente com a realidade: etiqueta vira
 * nó com id `#` mais o nome, então a tag `#cortex` do vault e o nó do meio
 * tinham a mesma identidade. Parar o cursor na etiqueta punha a rede a girar,
 * e o realce saía no nó errado.
 *
 * `::centro::` não colide com nada: os dois-pontos são ilegais em nome de
 * arquivo no Windows, então nenhum caminho de nota tem essa forma, e etiqueta
 * e nota inexistente sempre começam por `#` ou `?`.
 */
const CENTRO_ID = '::centro::'
const CENTRO_NOME = 'Cortex'
/*
 * Cinza claro, e não branco.
 *
 * Era `#f0f3f7`, quase branco puro: sobre o fundo `#1e1e1e` isso é o maior
 * contraste que a tela consegue dar, e o ponto acendia mais que qualquer nota
 * do vault. O centro precisa se destacar do emaranhado de linhas, não ganhar
 * de todo o resto — ele é a âncora do desenho, não o assunto dele.
 */
const COR_CENTRO = '#b9c2cc'
/** O raio do ponto do meio, em pixels de tela. Ele é a âncora: destaca. */
const RAIO_CENTRO = 9

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
 * — o que se fazia ao clicar — para cada nó saltar uns 9 px de uma vez.
 *
 * Com o passo proporcional à força, a coisa converge de verdade. Acima de
 * 0,08 volta a oscilar e nunca assenta — 0,03 tem margem folgada.
 */
const ETA = 0.03

/**
 * O teto de deslocamento por quadro.
 *
 * Só morde quando a rede está embaralhada — nos primeiros passos a partir da
 * espiral, por exemplo. Sem ele o primeiro quadro atira os nós para longe,
 * porque as forças começam enormes.
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
 */

/**
 * Quadros para assentar a partir da espiral inicial.
 *
 * Eram 1500. A varredura de convergência mostrou onde está o joelho da curva:
 * a força média cai de 0,133 (passo 100) para 0,012 (passo 200) e 0,0047
 * (passo 500); daí para 1500 ela só vai a 0,0016. Traduzindo para a tela, uma
 * força residual de 0,005 move o nó 0,09 px por quadro — invisível.
 *
 * 900 é passar do joelho com folga e ainda custar 400 ms uma única vez, em
 * vez dos 8,8 s que custava. E esse custo agora é pago UMA vez por sessão: o
 * layout fica guardado em `memoria` e volta pronto na próxima montagem.
 */
const PASSOS_ANTES = 900

/**
 * Quadros depois de o CONJUNTO de nós mudar — um filtro ligado, uma nota
 * criada.
 *
 * Aqui as posições já estão assentadas e só precisam se reacomodar. Rodam
 * pelo laço normal, um por quadro e no passo gentil, porque essa reacomodação
 * é a resposta visível ao que a pessoa acabou de fazer: ver a rede se abrir
 * quando as etiquetas somem é informação, e não espera.
 */
const PASSOS_REACOMODAR = 260

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

/**
 * Quadros do DESLIZE até um layout já calculado.
 *
 * "Reorganizar" antes reaquecia a simulação por 1500 quadros no passo cheio,
 * e a rede inteira se sacudia até assentar — feio, e ninguém consegue seguir
 * um nó no meio daquilo. Agora o destino é calculado de uma vez, fora da
 * tela, e os nós CAMINHAM até ele: cada um numa reta, sem tremer, com uma
 * aceleração no começo e uma freada no fim.
 *
 * 75 quadros são 1,25 s — tempo de o olho acompanhar um ponto do começo ao
 * fim do percurso.
 */
const PASSOS_DESLIZE = 75

/**
 * Quantos passos o destino do deslize custa a calcular.
 *
 * Bem menos que os 900 da partida, e a razão é que ele não parte da espiral:
 * parte de um layout já assentado com alguns nós fora do lugar. 400 passos
 * são 175 ms de conta — o suficiente para não se notar antes de o desenho
 * começar a andar.
 */
const PASSOS_DESTINO = 400

/**
 * A parede: até onde um nó pode ficar do centro, em múltiplos do raio da
 * nuvem assentada.
 *
 * Existe por um defeito concreto: puxar uma nota para muito longe a deixava
 * lá. Os 90 quadros de volta andam no passo gentil, no máximo 0,003 por
 * quadro — 0,27 no total. Quem arrastasse além disso nunca mais veria o nó
 * voltar, e ele ficava perdido fora do enquadramento.
 *
 * 1,12 do raio da nuvem: fora do desenho, mas colado nele. Nenhum nó
 * assentado chega perto da parede, então ela nunca interfere no layout — só
 * pega quem foi jogado para fora.
 */
const FOLGA_PAREDE = 1.12

/**
 * Quanto do excesso a parede recolhe por quadro.
 *
 * 6% por quadro: em 90 quadros sobra 0,4% da distância — o nó encosta no
 * círculo e para. E é um recolhimento CONTÍNUO, não um salto: quem soltou o
 * nó longe vê ele voltando, o que explica o que aconteceu.
 */
const RETORNO_PAREDE = 0.06

/**
 * A folga em volta do nó do meio, em múltiplos do espaçamento de equilíbrio.
 *
 * O centro não entra na física, então nada impedia uma nota de assentar em
 * cima dele — e aí o ponto grande e claro comia o vizinho. 1,1 abre um
 * respiro do tamanho de um vizinho: no zoom de abertura são cerca de vinte
 * pixels entre a borda do centro e o primeiro nó. O bastante para o centro se
 * ler sozinho, pouco o bastante para não virar uma cratera no meio da rede.
 */
const FOLGA_CENTRO = 1.1

/** Quanto o cursor precisa ficar parado para o realce pesado entrar, em ms. */
const ATRASO_FOCO = 420

/*
 * O giro em torno do centro.
 *
 * Segurar o nó Cortex e mexer o ponteiro vira a rede em volta dele, no
 * sentido em que a mão anda. É uma rotação de DESENHO: acontece dentro de
 * `paraTela`/`paraGrafo`, e as posições guardadas não mudam. Girar as
 * posições de verdade brigaria com a física — a gravidade puxa para o centro,
 * não para uma órbita — e o layout se desfaria a cada volta.
 */

/**
 * Quadros até o giro chegar à velocidade cheia, e até parar de novo.
 *
 * Sete segundos de cada lado. A rampa longa é o efeito, e não um detalhe: a
 * rede sai quase parada e vai ganhando velocidade até ficar uniforme, o que
 * dá tempo de largar cedo se a intenção era só virar um pouco. Ao soltar, ela
 * desacelera pela mesma curva em vez de travar no lugar.
 *
 * A curva é cúbica nos dois cantos (`suavizar`), então o primeiro segundo é
 * quase imóvel: em 60 quadros ela está a 1% da velocidade de cruzeiro. É de
 * propósito — o começo tem de ser devagarzinho de verdade, não devagar de
 * fachada.
 */
const RAMPA_GIRO = 420

/**
 * A velocidade de cruzeiro, em radianos por quadro.
 *
 * 0,009 dá uma volta em doze segundos — a rede rodando com vontade, que é o
 * que se quer depois de a rampa terminar. O começo é quase imóvel, então
 * nada disso chega de supetão.
 */
const GIRO_MAX = 0.009

/** Quantos pixels o dedo pode escorregar e ainda ser um clique. */
const FOLGA_CLIQUE = 4

/** Quanto tempo a animação de construção leva para revelar tudo, em ms. */
const DURACAO_ANIMACAO = 9000

/**
 * Quanto da distância até o alvo a câmera percorre por quadro.
 *
 * A roda do mouse chega aos trancos — um evento por entalhe —, e aplicar cada
 * um direto na escala fazia o desenho pular de degrau em degrau. Aqui a roda
 * só move o ALVO, e a câmera caminha até ele. O mesmo vale para o
 * enquadramento: ele move o alvo, e o desenho desliza até lá.
 *
 * 0,085 por quadro cobre quase toda a distância em uns 35 quadros: seis
 * décimos de segundo. Era 0,18 quando o entalhe valia 1,35; com o entalhe em
 * 1,8 o salto ficou grande demais para caber em 15 quadros, e via-se o
 * degrau. O primeiro quadro ainda anda 8,5% da distância, então a roda
 * responde na hora — o que fica longo é a chegada, que é justamente a parte
 * que o olho acompanha.
 */
const SUAVIDADE_ZOOM = 0.085

/** O enquadramento é uma viagem maior que um entalhe de roda; anda mais devagar. */
const SUAVIDADE_ENQUADRE = 0.09

/**
 * Quanto a escala muda por entalhe da roda.
 *
 * 1,8 — quase o dobro por entalhe. Três entalhes multiplicam a escala por
 * quase seis, então atravessar do enquadramento inteiro até ler uma nota são
 * três giros de roda. Com o passo anterior era preciso rolar muito, e o gesto
 * virava trabalho.
 *
 * Passo grande exige perseguição lenta: é o par `PASSO_ZOOM`/`SUAVIDADE_ZOOM`
 * que decide se o gesto sai contínuo ou aos degraus, e mexer num sem o outro
 * quebra os dois.
 */
const PASSO_ZOOM = 1.8

/** Espera antes de reler o grafo depois de o vault mudar, em ms. */
const ESPERA_RELEITURA = 400

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
 * Saíram de uma varredura sobre este vault medindo três coisas: quão redonda
 * fica a nuvem (proporção da caixa 1,00), quão uniforme é o espaçamento
 * (variação da distância ao vizinho 0,11) e quanto o link ainda organiza (nós
 * ligados a 0,30 da distância média entre dois nós quaisquer).
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
function lerAjustes(bruto: string | undefined): Ajustes {
  try {
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

/** Acelera no começo e freia no fim. É o que faz o deslize não ter emenda. */
const suavizar = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/**
 * O layout da última vez, guardado FORA do componente.
 *
 * Abrir uma nota desmonta a lente inteira — a nota substitui a view. Sem
 * isto, cada ida e volta pagava o assentamento de novo, e era esse o "trava
 * ao clicar para abrir a nota". Com o instantâneo aqui, voltar do texto para
 * a rede é instantâneo e a rede está exatamente como ficou.
 *
 * Módulo, e não `sessionStorage`: são centenas de posições que mudam o tempo
 * todo, e serializar isso a cada desmontagem seria trocar um custo por outro.
 * Perder o layout ao recarregar o app é aceitável — ele se refaz em 400 ms.
 */
let memoria: { nos: No[]; arestas: Aresta[]; camera: Camera } | null = null

type Camera = { x: number; y: number; escala: number }

/**
 * Casa o grafo recém-lido com o que já estava na tela.
 *
 * Nó que já existia mantém a posição — sem isto, criar UMA nota rearranjaria
 * o vault inteiro na cara de quem está olhando. Nó novo nasce na média dos
 * vizinhos que ele cita, que é perto de onde ele vai acabar ficando; sem
 * vizinho conhecido, na espiral do ângulo de ouro, que distribui sem repetir
 * e sem depender de sorte (dois nós no mesmo ponto é divisão por zero na
 * repulsão, e o grafo explode no primeiro quadro).
 */
function casar(bruto: Bruto, antes: No[] | null): { nos: No[]; novos: number } {
  const antigo = new Map((antes ?? []).map(n => [n.id, n]))
  const vizinhanca = new Map<string, string[]>()
  for (const a of bruto.arestas) {
    if (!vizinhanca.has(a.de)) vizinhanca.set(a.de, [])
    if (!vizinhanca.has(a.para)) vizinhanca.set(a.para, [])
    vizinhanca.get(a.de)?.push(a.para)
    vizinhanca.get(a.para)?.push(a.de)
  }
  let novos = 0
  const nos: No[] = bruto.nos.map((n, i) => {
    const velho = antigo.get(n.id)
    if (velho) return { ...n, x: velho.x, y: velho.y }
    novos++
    let sx = 0, sy = 0, quantos = 0
    for (const vid of vizinhanca.get(n.id) ?? []) {
      const v = antigo.get(vid)
      if (v) { sx += v.x; sy += v.y; quantos++ }
    }
    if (quantos > 0) {
      // Um empurrãozinho aleatório junto: dois nós novos que citam os mesmos
      // vizinhos cairiam exatamente no mesmo ponto.
      return { ...n, x: sx / quantos + (Math.random() - 0.5) * 0.01, y: sy / quantos + (Math.random() - 0.5) * 0.01 }
    }
    const ang = i * 2.399963
    const r = 0.4 * Math.sqrt(i / Math.max(1, bruto.nos.length))
    return { ...n, x: CENTRO + r * Math.cos(ang), y: CENTRO + r * Math.sin(ang) }
  })
  return { nos, novos }
}

export function Cerebro({ aoAbrir }: { aoAbrir: (path: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [dados, setDados] = useState<{ nos: No[]; arestas: Aresta[] } | null>(
    memoria ? { nos: memoria.nos, arestas: memoria.arestas } : null
  )
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState<No | null>(null)
  const [busca, setBusca] = useState('')
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO)
  const [painel, setPainel] = useState(false)
  /** O grupo isolado pela legenda, ou `null` para mostrar tudo. */
  const [foco, setFoco] = useState<string | null>(null)

  /*
   * O que muda 60 vezes por segundo mora em `ref`, e não em `useState`.
   *
   * Posição de nó e câmera mudam a cada quadro. Em `useState`, cada quadro
   * seria uma renderização do React inteira — para desenhar num canvas que o
   * React nem controla.
   *
   * `sobre`, `busca`, `foco` e `ajustes` também viram `ref` por um motivo
   * mais concreto: eles estavam nas dependências do efeito que monta o
   * canvas, e por isso CADA movimento do mouse desmontava e remontava todos
   * os ouvintes de evento da tela.
   */
  const camera = useRef<Camera>(memoria?.camera ?? { x: CENTRO, y: CENTRO, escala: ESCALA_BASE })
  /** Para onde a câmera está indo. Ela persegue — ver `seguirCamera`. */
  const alvoCamera = useRef<Camera>({ ...camera.current })
  /** Que ponto do grafo tem de continuar sob o cursor durante o zoom. */
  const ancora = useRef<{ gx: number; gy: number; px: number; py: number } | null>(null)
  /** Quão depressa a câmera persegue o alvo neste momento. */
  const suavidadeCamera = useRef(SUAVIDADE_ZOOM)
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
  const restantes = useRef(0)
  /** Verdadeiro quando as posições ainda são a espiral e precisam assentar. */
  const precisaResolver = useRef(memoria === null)
  const buscaRef = useRef('')
  const ajustesRef = useRef(ajustes)
  const focoRef = useRef<string | null>(null)
  buscaRef.current = busca
  ajustesRef.current = ajustes
  focoRef.current = foco

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

  /**
   * Um quadro só se desenha quando alguma coisa mudou.
   *
   * A rede assentada e parada não precisa de 60 redesenhos por segundo de
   * quase mil linhas. Sem esta marca, a lente queimava processador de forma
   * contínua o tempo todo em que estivesse aberta.
   */
  const sujo = useRef(true)
  const marcarSujo = useCallback(() => { sujo.current = true }, [])

  const arrastando = useRef<{
    i: number
    px: number; py: number
    ox: number; oy: number
    mexeu: boolean
  } | null>(null)

  /** Enquadra assim que a simulação assentar. */
  const precisaEnquadrar = useRef(memoria === null)
  /** A animação de construção: quantos nós já apareceram. */
  const animacao = useRef<{ ativa: boolean; comeco: number }>({ ativa: false, comeco: 0 })
  /** Pedido de deslize até um layout pronto — ver `PASSOS_DESLIZE`. */
  const pedidoDeslize = useRef(0)

  /**
   * Lê o grafo do índice.
   *
   * Roda na montagem e de novo a cada mudança do vault, para uma nota criada
   * aparecer na rede sem ninguém precisar sair da lente e voltar.
   */
  const carregar = useCallback((vivo: () => boolean): void => {
    void window.vaultApi.invoke('vault:grafo', {})
      .then(r => {
        if (!vivo()) return
        const bruto = r as Bruto
        setDados(antes => {
          const { nos, novos } = casar(bruto, antes?.nos ?? null)
          // Só reacomoda se o conjunto de nós MUDOU. Uma nota editada mexe no
          // vault e dispara esta leitura, mas não muda o desenho — e sacudir
          // a rede porque alguém salvou um texto seria puro ruído.
          const mudou = novos > 0 || (antes?.nos.length ?? -1) !== nos.length ||
            (antes?.arestas.length ?? -1) !== bruto.arestas.length
          if (mudou && !precisaResolver.current) {
            restantes.current = Math.max(restantes.current, PASSOS_REACOMODAR)
            suaves.current = Math.max(suaves.current, PASSOS_REACOMODAR)
          }
          sujo.current = true
          return { nos, arestas: bruto.arestas }
        })
        setErro(null)
      })
      .catch((e: unknown) => {
        if (vivo()) setErro(e instanceof Error ? e.message : 'não deu para ler a rede')
      })
  }, [])

  useEffect(() => {
    let vivo = true
    const ok = (): boolean => vivo
    carregar(ok)
    // O vault mudou: pode ser nota nova, apagada, ou um link novo dentro de
    // uma nota existente. A espera junta a rajada de eventos que uma única
    // gravação produz numa leitura só.
    let pendente: ReturnType<typeof setTimeout> | null = null
    const parar = window.vaultApi.onVaultChange(() => {
      if (pendente) clearTimeout(pendente)
      pendente = setTimeout(() => carregar(ok), ESPERA_RELEITURA)
    })
    return () => {
      vivo = false
      if (pendente) clearTimeout(pendente)
      parar()
    }
  }, [carregar])

  /*
   * Traz os ajustes guardados, uma vez, na montagem.
   *
   * Eles vinham do `localStorage`, que é SÍNCRONO e por isso podia entrar no
   * `useState` inicial. Só que o armazenamento local não funciona no app
   * instalado — a janela carrega por `file://`, origem opaca, e o Chromium
   * recusa gravar ali. Conferido no disco: o armazenamento do app não tinha
   * uma entrada sequer de `file://`, só as de `localhost:5173` que o modo de
   * desenvolvimento gravava. Era por isso que os ajustes voltavam ao padrão a
   * cada vez que o Cortex fechava.
   *
   * Agora vêm do processo principal, e por isso chegam DEPOIS do primeiro
   * quadro. O grafo desenha um instante com os valores padrão e se acerta em
   * seguida — invisível, porque o assentamento inicial leva mais tempo que
   * isto.
   */
  useEffect(() => {
    let vivo = true
    void window.vaultApi.lerPrefs()
      .then(prefs => { if (vivo) setAjustes(lerAjustes(prefs[CHAVE_AJUSTES])) })
      .catch(() => { /* sem preferência guardada: os padrões servem */ })
    return () => { vivo = false }
  }, [])

  /** Guarda os ajustes a cada mudança. Falha em silêncio: é preferência. */
  useEffect(() => {
    void window.vaultApi.gravarPref(CHAVE_AJUSTES, JSON.stringify(ajustes)).catch(() => {})
    sujo.current = true
  }, [ajustes])

  /** O atraso do realce pesado — ver `sobreRef`/`focadoRef`. */
  useEffect(() => {
    sujo.current = true
    if (!sobre) { focadoRef.current = null; return }
    const t = setTimeout(() => { focadoRef.current = sobre; sujo.current = true }, ATRASO_FOCO)
    return () => clearTimeout(t)
  }, [sobre])

  /**
   * O filtro da legenda não refaz o layout.
   *
   * Ele esconde o que não é do grupo e reenquadra no que sobrou — as posições
   * ficam onde estavam. É de propósito: o valor de isolar uma pasta é ver
   * ONDE ela mora dentro da rede, e recalcular o arranjo destruiria justo
   * essa informação. Também é o que torna o clique instantâneo.
   */
  useEffect(() => {
    sujo.current = true
    precisaEnquadrar.current = true
  }, [foco])

  /**
   * O que de fato entra no desenho, depois dos filtros do painel.
   *
   * A consulta traz tudo — notas, etiquetas e o que ainda não existe. Quem
   * escolhe é esta tela, e a escolha muda o LAYOUT: tirar 151 etiquetas de
   * uma rede de 305 nós rearranja o resto. Por isso é um `useMemo` do qual o
   * efeito do canvas depende, e não um `if` dentro do laço de desenho — ao
   * contrário do filtro da legenda, que é só exibição.
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

  /*
   * A memória guarda o grafo COMPLETO, e não o filtrado.
   *
   * O efeito só enxerga `grafo`, que já passou pelos filtros do painel.
   * Guardar aquilo faria as etiquetas desaparecerem de vez ao trocar de lente
   * com o filtro ligado. As posições, porém, são escritas nos mesmos objetos
   * — `filter` preserva a referência —, então o que fica guardado tem tudo e
   * está atualizado.
   */
  const dadosRef = useRef(dados)
  dadosRef.current = dados

  /**
   * O nó do meio, montado aqui porque o grau dele é quantos nós existem.
   *
   * Ele não vem da consulta e não entra em `grafo`: é uma camada por cima —
   * ver `CENTRO_ID`.
   */
  const centro = useMemo<No>(() => ({
    id: CENTRO_ID,
    title: CENTRO_NOME,
    especie: 'centro',
    grupo: CENTRO_NOME,
    grau: grafo?.nos.length ?? 0,
    x: CENTRO,
    y: CENTRO
  }), [grafo])

  const corDaPasta = useCallback(
    (pasta: string): string => ajustes.cores[pasta] ?? CORES_PADRAO[pasta] ?? COR_PADRAO,
    [ajustes.cores]
  )

  /** O grupo isolado sumiu do grafo (o painel escondeu a espécie): solta o filtro. */
  useEffect(() => {
    if (foco !== null && grupos.length > 0 && !grupos.some(g => g.nome === foco)) setFoco(null)
  }, [grupos, foco])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grafo) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const nos = grafo.nos
    const n = nos.length
    if (n === 0) return

    /*
     * As posições passam para arrays enquanto o efeito vive.
     *
     * `px`/`py` são a verdade aqui dentro; os objetos `No` recebem tudo de
     * volta na limpeza. É essa passagem que faz o assentamento custar 400 ms
     * em vez de 8,8 s — ver o cabeçalho do arquivo.
     */
    const px = new Float64Array(n)
    const py = new Float64Array(n)
    const dx = new Float64Array(n)
    const dy = new Float64Array(n)
    const indice = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      indice.set(nos[i].id, i)
      px[i] = nos[i].x
      py[i] = nos[i].y
    }

    // As arestas viram dois arrays de índices: o laço da física não pode
    // fazer busca por id num `Map` mil vezes por quadro.
    const ligA: number[] = []
    const ligB: number[] = []
    for (const e of grafo.arestas) {
      const a = indice.get(e.de)
      const b = indice.get(e.para)
      if (a === undefined || b === undefined || a === b) continue
      ligA.push(a)
      ligB.push(b)
    }
    const ea = Int32Array.from(ligA)
    const eb = Int32Array.from(ligB)
    const m = ea.length

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
      sujo.current = true
    }
    dimensionar()
    const aoRedimensionar = (): void => { dimensionar(); precisaEnquadrar.current = true }
    window.addEventListener('resize', aoRedimensionar)

    /** Passa pelo filtro da legenda? */
    const noFoco = (i: number): boolean =>
      focoRef.current === null || nos[i].grupo === focoRef.current

    /*
     * O giro é ligado por um BOTÃO SEGURADO, e não pelo cursor descansando.
     *
     * A primeira versão girava quando o cursor ficava parado em cima do
     * centro. Começava sem ninguém pedir. Agora se segura o nó do meio e a
     * rede gira enquanto o dedo estiver ali; soltou, ela desacelera e para
     * onde está.
     *
     * Enquanto se segura, mexer o mouse e rolar a roda não interrompem nada:
     * o gesto é o botão apertado, não a posição do ponteiro. Segurar no
     * centro também não move a câmera — pegar ali é girar, e só.
     *
     * `giro` nunca volta a zero. Rebobinar a cena na frente de quem está
     * olhando seria pior do que deixá-la no ângulo em que ficou.
     */
    let giro = 0
    let velGiro = 0
    let quadrosGirando = 0
    /** O botão está apertado em cima do nó do meio? */
    let segurandoCentro = false

    const andarGiro = (): boolean => {
      if (segurandoCentro) quadrosGirando++
      else quadrosGirando = 0
      // Fração da velocidade cheia que se quer AGORA: sobe pela rampa ao
      // segurar e desce de volta a zero ao soltar. Nunca salta.
      const querida = segurandoCentro
        ? Math.min(1, quadrosGirando / RAMPA_GIRO)
        : 0
      // A velocidade PERSEGUE essa fração, o que arredonda os dois cantos —
      // a partida e a parada.
      const alvo = suavizar(querida) * GIRO_MAX
      velGiro += (alvo - velGiro) / RAMPA_GIRO * 6
      if (Math.abs(velGiro) < 1e-7) { velGiro = 0; return false }
      // Negativo porque o y da tela cresce para BAIXO: com o sinal positivo a
      // rotação sairia no sentido horário.
      giro -= velGiro
      return true
    }

    /**
     * Câmera simples: um centro, uma escala em pixels por unidade, e o giro.
     *
     * O giro entra aqui, e não nas posições, para a física não ter de saber
     * que ele existe. `paraGrafo` desfaz exatamente a mesma rotação, então o
     * dedo continua pegando o nó que está desenhado sob ele mesmo com a rede
     * girando.
     */
    const girado = (x: number, y: number): [number, number] => {
      if (giro === 0) return [x, y]
      const rx = x - CENTRO, ry = y - CENTRO
      const c = Math.cos(giro), s = Math.sin(giro)
      return [CENTRO + rx * c - ry * s, CENTRO + rx * s + ry * c]
    }
    const paraTela = (x: number, y: number): [number, number] => {
      const [gx, gy] = girado(x, y)
      return [
        (gx - camera.current.x) * camera.current.escala + l / 2,
        (gy - camera.current.y) * camera.current.escala + a / 2
      ]
    }
    const paraGrafo = (cx: number, cy: number): [number, number] => {
      const gx = (cx - l / 2) / camera.current.escala + camera.current.x
      const gy = (cy - a / 2) / camera.current.escala + camera.current.y
      if (giro === 0) return [gx, gy]
      const rx = gx - CENTRO, ry = gy - CENTRO
      const c = Math.cos(-giro), s = Math.sin(-giro)
      return [CENTRO + rx * c - ry * s, CENTRO + rx * s + ry * c]
    }

    /**
     * Ajusta o ALVO da câmera para tudo caber, com uma folga curta.
     *
     * O alvo, e não a câmera: enquadrar é uma viagem longa, e um corte seco
     * até o destino perde a relação entre o que estava na tela e o que passa
     * a estar. A câmera desliza até aqui — ver `seguirCamera`.
     */
    const enquadrar = (): void => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let i = 0; i < n; i++) {
        if (!noFoco(i)) continue
        // As coordenadas GIRADAS: a moldura tem de caber o que está
        // desenhado, e com o giro em curso as duas não coincidem.
        const [gx, gy] = girado(px[i], py[i])
        if (gx < x0) x0 = gx
        if (gy < y0) y0 = gy
        if (gx > x1) x1 = gx
        if (gy > y1) y1 = gy
      }
      if (!Number.isFinite(x0)) return
      const largura = Math.max(1e-6, x1 - x0)
      const altura = Math.max(1e-6, y1 - y0)
      alvoCamera.current = {
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        // 0,95, e não 0,86: com folga demais o grafo fica pequeno no meio de
        // um painel grande, e sobra moldura escura dos dois lados.
        // O teto existe para o filtro que deixa UM nó: sem ele a câmera
        // ampliaria até o infinito para "enquadrar" um ponto sozinho.
        escala: Math.min(3000, Math.min(l / largura, a / altura) * 0.95)
      }
      suavidadeCamera.current = SUAVIDADE_ENQUADRE
      ancora.current = null
      sujo.current = true
    }

    const k = Math.sqrt(AREA / Math.max(1, n))

    /**
     * O respiro em volta do nó do meio, em coordenadas do grafo.
     *
     * Fica aqui em cima porque três lugares precisam dele e precisam do MESMO
     * número: a física, que empurra quem entra nele; o deslize, que não pode
     * atravessá-lo a caminho do destino; e o desenho, que limita o tamanho do
     * ponto central a ele.
     */
    const margemCentro = k * FOLGA_CENTRO

    /** Empurra um ponto para fora do respiro do centro, se estiver dentro. */
    const foraDoCentro = (x: number, y: number): [number, number] => {
      const rx = x - CENTRO, ry = y - CENTRO
      const q = rx * rx + ry * ry
      if (q >= margemCentro * margemCentro) return [x, y]
      const r = Math.sqrt(q)
      if (r < 1e-9) {
        const ang = Math.random() * Math.PI * 2
        return [CENTRO + Math.cos(ang) * margemCentro, CENTRO + Math.sin(ang) * margemCentro]
      }
      return [CENTRO + (rx / r) * margemCentro, CENTRO + (ry / r) * margemCentro]
    }

    /**
     * O espaçamento típico da rede, e o raio da nuvem.
     *
     * O espaçamento é a MEDIANA da distância ao vizinho mais próximo, e não a
     * média: um punhado de nós grudados puxaria a média para baixo e
     * encolheria todos os pontos por causa de uns poucos.
     *
     * O raio é a maior distância ao centro, e é dele que sai a parede —
     * ver `FOLGA_PAREDE`.
     *
     * Preenchidos depois do assentamento: antes disso as posições ainda são a
     * espiral inicial e não dizem nada.
     */
    let espacamento = ESPACAMENTO_BASE
    let raioParede = Infinity
    const medirLayout = (): void => {
      if (n < 2) return
      const perto: number[] = []
      const raios: number[] = []
      for (let i = 0; i < n; i++) {
        const xi = px[i], yi = py[i]
        let menor = Infinity
        for (let j = 0; j < n; j++) {
          if (i === j) continue
          const ex = px[j] - xi, ey = py[j] - yi
          // Compara o QUADRADO: a raiz só sai uma vez por nó, no fim.
          const q = ex * ex + ey * ey
          if (q < menor) menor = q
        }
        if (Number.isFinite(menor)) perto.push(Math.sqrt(menor))
        const rx = xi - CENTRO, ry = yi - CENTRO
        raios.push(Math.sqrt(rx * rx + ry * ry))
      }
      if (perto.length > 0) {
        perto.sort((x, y) => x - y)
        espacamento = perto[Math.floor(perto.length / 2)] || ESPACAMENTO_BASE
      }
      /*
       * O raio é o PERCENTIL 95, e não o maior.
       *
       * Com o maior, a parede engordava sozinha: um nó largado longe é
       * recolhido até encostar nela, e a medição seguinte tomava aquele nó
       * como a borda legítima da nuvem e afastava a parede mais 12%. Cada
       * arrasto empurrava o limite um pouco mais para fora, até ele não
       * segurar mais nada. O percentil ignora o caso isolado, que é
       * exatamente o que a parede existe para pegar.
       */
      if (raios.length > 0) {
        raios.sort((x, y) => x - y)
        const borda = raios[Math.floor(raios.length * 0.95)] ?? raios[raios.length - 1]
        raioParede = Math.max(0.05, borda * FOLGA_PAREDE)
      }
    }

    /**
     * Um passo da física sobre um par de arrays qualquer.
     *
     * Recebe os arrays em vez de fechar sobre `px`/`py` porque o deslize
     * precisa calcular o layout de DESTINO numa cópia, sem que nada disso
     * apareça na tela enquanto é calculado.
     */
    const passoEm = (
      X: Float64Array, Y: Float64Array, DX: Float64Array, DY: Float64Array,
      eta: number, teto: number, parado: number, parede: number
    ): void => {
      const aj = ajustesRef.current
      // O comprimento de repouso do link. Maior = links mais compridos.
      const kLink = k * Math.max(0.05, aj.distanciaLink)
      // O respiro em volta do nó do meio — ver `FOLGA_CENTRO`.
      const margem = margemCentro

      // Deslocamento, e não velocidade: cada quadro parte do zero, e por isso
      // não há energia acumulada para o grafo explodir.
      DX.fill(0)
      DY.fill(0)

      /*
       * Repulsão entre todos os pares: k³/d².
       *
       * `1/d²` e não `1/d` (o Fruchterman-Reingold clássico) por um motivo
       * que não é gosto: com `1/d`, o empurrão para fora dentro de uma nuvem
       * uniforme cresce linearmente com o raio — exatamente como a gravidade.
       * Duas forças com a mesma lei não se equilibram, uma vence sempre, e o
       * resultado é ou tudo espremido no centro ou tudo espalhado sem fim.
       *
       * O(n²), e de propósito: 305 nós dão 46 mil pares por quadro. Escrito
       * assim — arrays, sem `hypot`, com o acumulador do nó `i` num local —
       * isso é meio milissegundo. Barnes-Hut só compensaria acima de alguns
       * milhares de nós, e traria erro de aproximação junto.
       */
      const kkk = aj.forcaRepulsao * k * k * k
      /*
       * Piso na distância, e não só proteção contra o zero.
       *
       * Com `1/d²`, dois nós muito próximos geram uma força enorme e um
       * chuta o outro para o outro lado da tela. O piso é um décimo da
       * distância de equilíbrio: perto o bastante para nunca atrapalhar,
       * longe o bastante para a força não explodir.
       */
      const piso = k * 0.1
      const piso2 = piso * piso
      for (let i = 0; i < X.length; i++) {
        const xi = X[i], yi = Y[i]
        let ax = DX[i], ay = DY[i]
        for (let j = i + 1; j < X.length; j++) {
          let ex = X[j] - xi
          let ey = Y[j] - yi
          let q = ex * ex + ey * ey
          if (q < piso2) {
            if (q < 1e-18) {
              ex = (Math.random() - 0.5) * piso
              ey = (Math.random() - 0.5) * piso
            }
            q = piso2
          }
          // f = kkk/d² aplicado na direção unitária (ex/d, ey/d), ou seja
          // (ex, ey) · kkk/d³ — e d³ é q·√q. Uma raiz por par, e nenhuma
          // divisão a mais.
          const f = kkk / (q * Math.sqrt(q))
          const fx = ex * f, fy = ey * f
          ax -= fx; ay -= fy
          DX[j] += fx; DY[j] += fy
        }
        DX[i] = ax; DY[i] = ay
      }

      // Atração ao longo dos links: cresce com a distância, então dois nós
      // ligados nunca ficam em cantos opostos da tela.
      for (let e = 0; e < m; e++) {
        const i = ea[e], j = eb[e]
        const ex = X[j] - X[i]
        const ey = Y[j] - Y[i]
        const d = Math.sqrt(ex * ex + ey * ey) || 1e-6
        // f = forcaLink·d²/kLink na direção unitária = (ex, ey)·forcaLink·d/kLink.
        const f = (aj.forcaLink * d) / kLink
        const fx = ex * f, fy = ey * f
        DX[i] += fx; DY[i] += fy
        DX[j] -= fx; DY[j] -= fy
      }

      for (let i = 0; i < X.length; i++) {
        if (i === parado) continue
        // A gravidade. Cresce com a distância, então mal se nota no miolo e
        // segura firme quem tenta escapar para longe.
        const gx = DX[i] + (CENTRO - X[i]) * aj.forcaCentro
        const gy = DY[i] + (CENTRO - Y[i]) * aj.forcaCentro
        const q = gx * gx + gy * gy
        if (q > 1e-18) {
          const d = Math.sqrt(q)
          // Proporcional à força, e não um passo fixo: é isto que faz a
          // simulação assentar em vez de oscilar em volta do equilíbrio.
          const anda = Math.min(d * eta, teto)
          X[i] += (gx / d) * anda
          Y[i] += (gy / d) * anda
        }

        /*
         * A parede recolhe quem está longe demais.
         *
         * Só pega quem foi ARRASTADO para fora: nenhum nó assentado chega ao
         * raio da nuvem vezes `FOLGA_PAREDE`. E recolhe uma fração por
         * quadro, o que faz o nó voltar caminhando — ver `RETORNO_PAREDE`.
         */
        if (parede < Infinity) {
          const rx = X[i] - CENTRO, ry = Y[i] - CENTRO
          const rq = rx * rx + ry * ry
          if (rq > parede * parede) {
            const r = Math.sqrt(rq)
            const puxa = (r - parede) * RETORNO_PAREDE
            X[i] -= (rx / r) * puxa
            Y[i] -= (ry / r) * puxa
          }
        }

        /*
         * E a folga em volta do centro, que é a mesma ideia ao contrário.
         *
         * O nó do meio não participa da física, então nenhuma repulsão o
         * protege: sem isto uma nota assenta em cima dele. Vale sempre,
         * inclusive no assentamento inicial — ver `FOLGA_CENTRO`.
         */
        const mx = X[i] - CENTRO, my = Y[i] - CENTRO
        const mq = mx * mx + my * my
        if (mq < margem * margem) {
          const r = Math.sqrt(mq)
          if (r < 1e-9) {
            // Exatamente no centro não há direção para empurrar; sorteia uma.
            const ang = Math.random() * Math.PI * 2
            X[i] = CENTRO + Math.cos(ang) * margem
            Y[i] = CENTRO + Math.sin(ang) * margem
          } else {
            const empurra = (margem - r) * RETORNO_PAREDE
            X[i] += (mx / r) * empurra
            Y[i] += (my / r) * empurra
          }
        }
      }
    }

    /** Um passo da física de verdade, na tela. */
    const passo = (): void => {
      // Modo suave: a rede acompanha em vez de se sacudir. Vale no arrasto e
      // na volta depois de soltar. Ver `ETA_ARRASTO`.
      const suave = suaves.current > 0
      if (suave) suaves.current--
      passoEm(
        px, py, dx, dy,
        suave ? ETA_ARRASTO : ETA,
        suave ? PASSO_MAX_ARRASTO : PASSO_MAX,
        arrastando.current?.i ?? -1,
        raioParede
      )
      sujo.current = true
    }

    /*
     * Resolve antes de mostrar, e SÓ quando é preciso.
     *
     * Da primeira vez as posições são a espiral, e sem isto a tela abria com
     * tudo amontoado e sacudindo até assentar. Nas vezes seguintes — trocar
     * de lente e voltar, ligar um filtro — as posições já vêm assentadas, e
     * repetir este bloco era o que travava a tela por segundos a fio.
     */
    if (precisaResolver.current) {
      for (let i = 0; i < PASSOS_ANTES; i++) {
        passoEm(px, py, dx, dy, ETA, PASSO_MAX, -1, Infinity)
      }
      precisaResolver.current = false
      restantes.current = 0
      medirLayout()
      enquadrar()
      // Da primeira vez a câmera não desliza de lugar nenhum: ela JÁ nasce
      // no lugar certo. Deslizar aqui seria animar a partir de um
      // enquadramento que ninguém chegou a ver.
      camera.current = { ...alvoCamera.current }
      precisaEnquadrar.current = false
    } else {
      medirLayout()
    }

    /** O deslize em curso, ou `null`. */
    let deslize: {
      ax: Float64Array; ay: Float64Array
      bx: Float64Array; by: Float64Array
      q: number
    } | null = null

    /**
     * Calcula onde a rede quer estar e manda os nós CAMINHAREM até lá.
     *
     * É o que "Reorganizar" faz. A versão anterior reaquecia a simulação e
     * deixava 1500 quadros de física acontecerem na tela: a rede inteira se
     * sacudia, cada nó tremendo em volta do lugar até parar. Aqui o destino
     * sai de uma vez, fora da tela, e o que se vê é cada ponto andando em
     * linha reta até ele.
     */
    const deslizarAteORepouso = (): void => {
      const bx = Float64Array.from(px)
      const by = Float64Array.from(py)
      const tdx = new Float64Array(n)
      const tdy = new Float64Array(n)
      for (let i = 0; i < PASSOS_DESTINO; i++) {
        passoEm(bx, by, tdx, tdy, ETA, PASSO_MAX, -1, Infinity)
      }
      deslize = { ax: Float64Array.from(px), ay: Float64Array.from(py), bx, by, q: 0 }
      restantes.current = 0
      suaves.current = 0
    }

    const andarDeslize = (): void => {
      if (!deslize) return
      deslize.q++
      const t = suavizar(Math.min(1, deslize.q / PASSOS_DESLIZE))
      for (let i = 0; i < n; i++) {
        /*
         * O caminho é reto, mas não pode atravessar o meio.
         *
         * Origem e destino ficam os dois fora do respiro do centro, e mesmo
         * assim a reta entre eles passa por dentro quando o nó vai de um lado
         * ao outro da rede. No meio do percurso ele desaparecia atrás do
         * ponto central — mais visível no zoom afastado, onde a folga vale
         * poucos pixels. Empurrar para a borda do respiro desvia o trajeto e
         * o nó contorna o meio em vez de sumir dentro dele.
         */
        const [gx, gy] = foraDoCentro(
          deslize.ax[i] + (deslize.bx[i] - deslize.ax[i]) * t,
          deslize.ay[i] + (deslize.by[i] - deslize.ay[i]) * t
        )
        px[i] = gx
        py[i] = gy
      }
      sujo.current = true
      if (deslize.q >= PASSOS_DESLIZE) {
        deslize = null
        medirLayout()
        enquadrar()
      }
    }

    const desenhar = (): void => {
      ctx.clearRect(0, 0, l, a)

      const aj = ajustesRef.current
      // Quem apaga o resto é o FOCADO (mouse parado), nunca o que está só sob
      // o cursor de passagem.
      const alvo = focadoRef.current
      const sobCursor = sobreRef.current
      // Parar o cursor no centro acende TUDO, e não "os vizinhos do centro":
      // ele liga em todos, então a resposta honesta é a rede inteira acesa.
      const centroAceso = alvo?.id === CENTRO_ID
      const acesos = alvo && !centroAceso ? vizinhos.get(alvo.id) ?? new Set<string>() : null
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
        ? (performance.now() - an.comeco) / DURACAO_ANIMACAO * n
        : Infinity
      if (an.ativa && revelados > n + 1) an.ativa = false
      const dentro = (i: number): boolean =>
        noFoco(i) && (ordemAnimacao.get(nos[i].id) ?? 0) < revelados

      /*
       * Os raios do meio: uma linha do centro até cada nó visível.
       *
       * Bem apagados — 4% de opacidade. São trezentas linhas saindo do mesmo
       * ponto: no traço das arestas normais elas virariam uma mancha branca
       * que enterra o desenho. Assim leem-se como um brilho, e a estrutura do
       * vault continua sendo o que se vê.
       *
       * Quando o cursor para EM CIMA do centro, elas acendem todas: é a
       * resposta à pergunta "liga em quê?", igual à de qualquer outro nó.
       */
      const [ccx, ccy] = paraTela(CENTRO, CENTRO)
      if (alvo === null || centroAceso) {
        const raios = new Path2D()
        let temRaio = false
        for (let i = 0; i < n; i++) {
          if (!dentro(i)) continue
          const [rx, ry] = paraTela(px[i], py[i])
          raios.moveTo(ccx, ccy)
          raios.lineTo(rx, ry)
          temRaio = true
        }
        if (temRaio) {
          // Aceso, mas discreto: são trezentas linhas saindo do mesmo ponto,
          // e a soma delas perto do centro é muito mais clara que uma só.
          ctx.strokeStyle = centroAceso ? 'rgba(190,215,240,.13)' : 'rgba(170,185,205,.04)'
          ctx.lineWidth = 1
          ctx.stroke(raios)
        }
      }

      /*
       * As arestas em TRÊS traços, e não em novecentos.
       *
       * Cada aresta era um `beginPath`/`stroke` próprio — quase mil trocas de
       * estado do canvas por quadro. Como só existem três aparências (acesa,
       * apagada, normal), dá para juntar cada grupo num caminho só e traçar
       * três vezes.
       */
      ctx.lineWidth = Math.max(0.3, aj.espessuraLinha)
      const acesa = new Path2D()
      const comum = new Path2D()
      let temAcesa = false
      let temComum = false
      for (let e = 0; e < m; e++) {
        const i = ea[e], j = eb[e]
        // Na animação, a linha só aparece quando as DUAS pontas existirem —
        // é o que faz a rede parecer se costurando, e não riscos no vazio.
        if (!dentro(i) || !dentro(j)) continue
        const ligada = alvo !== null && !centroAceso &&
          (nos[i].id === alvo.id || nos[j].id === alvo.id)
        const [ax, ay] = paraTela(px[i], py[i])
        const [bx2, by2] = paraTela(px[j], py[j])
        const alvoPath = ligada ? acesa : comum
        alvoPath.moveTo(ax, ay)
        alvoPath.lineTo(bx2, by2)
        if (ligada) temAcesa = true; else temComum = true
      }
      if (temComum) {
        ctx.strokeStyle = alvo && !centroAceso
          ? 'rgba(150,158,170,.07)'
          : 'rgba(150,158,170,.34)'
        ctx.stroke(comum)
      }
      if (temAcesa) {
        ctx.strokeStyle = 'rgba(160,205,245,.85)'
        ctx.stroke(acesa)
      }
      ctx.lineWidth = 1

      /*
       * O ponto encolhe quando a rede adensa, e cresce com o zoom — devagar e
       * com teto, porque ampliar não pode transformar cada nota numa bolha
       * que cobre as linhas.
       *
       * Sem a parte da densidade, ganhar as 151 etiquetas aproximou os nós e o
       * ponto do mesmo tamanho passou a cobrir o vizinho. Comparando o
       * espaçamento medido com aquele para o qual os raios foram desenhados, o
       * ponto acompanha a densidade sozinho.
       */
      const densidade = Math.min(1, espacamento / ESPACAMENTO_BASE)
      const escalaPonto = Math.min(1.5, Math.max(0.6, camera.current.escala / ESCALA_BASE))
        * densidade * Math.max(0.1, aj.tamanhoNo)

      /** Candidatos a rótulo, resolvidos depois dos pontos. */
      const rotulos: { no: No; cx: number; cy: number; r: number; peso: number }[] = []
      /*
       * Acima de que escala todo nome aparece. `limiarNome` 1 = sempre.
       *
       * A faixa ia de 4 a 0,1 vezes a escala base, e com isso os nomes
       * entravam cedo demais: no enquadramento de abertura já saíam dezenas
       * deles, e o desenho virava uma parede de texto com pontos atrás. A
       * faixa agora vai de 9 a 0,2, ou seja, é preciso mais que o dobro de
       * zoom para o nome aparecer — quem quiser o comportamento antigo empurra
       * o controle "Quando o nome aparece" para cima.
       */
      const escalaDoNome = ESCALA_BASE * (9 - Math.min(1, Math.max(0, aj.limiarNome)) * 8.8)

      for (let i = 0; i < n; i++) {
        if (!dentro(i)) continue
        const no = nos[i]
        const [cx, cy] = paraTela(px[i], py[i])
        const r = raioDe(no.grau) * escalaPonto
        // Fora da tela não se desenha. Num zoom alto isso tira a maior parte
        // dos nós do laço antes de qualquer conta de canvas.
        if (cx < -r - 60 || cy < -r - 60 || cx > l + r + 60 || cy > a + r + 60) continue
        const achado = termo !== '' && no.title.toLowerCase().includes(termo)
        // O próprio nó focado não se apaga: ele não está na lista de vizinhos
        // dele mesmo, e sem esta ressalva ele apagaria junto com o resto.
        const apagado = (alvo !== null && !centroAceso &&
          no.id !== alvo.id && !acesos?.has(no.id)) ||
          (termo !== '' && !achado)

        ctx.globalAlpha = apagado ? 0.18 : 1
        ctx.fillStyle = aj.cores[no.grupo] ?? CORES_PADRAO[no.grupo] ?? COR_PADRAO
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()

        // Contorno claro no que está sob o cursor: o realce LEVE do passar de
        // mouse. Diz "é este" sem mexer em mais nada da tela.
        if (no === sobCursor) {
          ctx.strokeStyle = 'rgba(255,255,255,.92)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(cx, cy, r + 2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = 1
        }

        ctx.globalAlpha = 1

        if (apagado) continue
        const querNome = no === sobCursor || no.id === alvo?.id || achado ||
          camera.current.escala > escalaDoNome
        // O peso decide quem ganha quando dois nomes brigam pelo mesmo
        // espaço: primeiro o que está sob o cursor, depois o que a busca
        // achou, e por último o mais ligado.
        if (querNome) {
          const peso = no === sobCursor ? 1e9 : achado ? 1e6 : no.grau
          rotulos.push({ no, cx, cy, r, peso })
        }
      }

      /*
       * O centro por cima de tudo.
       *
       * Maior que qualquer nó e claro, com um halo: ele é a âncora da tela, e
       * quem entra na lente tem de achar o meio sem procurar. O nome dele
       * entra na fila de rótulos com o peso mais alto que existe — o único
       * nome que nunca cede espaço a outro.
       */
      const apagadoCentro = alvo !== null && !centroAceso
      ctx.globalAlpha = apagadoCentro ? 0.25 : 1
      /*
       * O ponto do meio nunca é maior que o respiro em volta dele.
       *
       * O fator dos outros pontos tem piso (0,6), então no zoom afastado ele
       * parava de encolher — enquanto a folga, que vive em coordenadas do
       * grafo, continuava encolhendo em pixels. A partir de certo ponto o
       * ponto central passava a cobrir o vizinho mais próximo, e era isso que
       * escondia notas atrás dele com pouco zoom.
       *
       * Limitar o RAIO em vez de afastar os nós é o certo: mexer na folga
       * faria o layout mudar conforme o zoom, e o desenho tem de ser o mesmo
       * desenho de perto e de longe.
       */
      // Metade do vão, e não um número fixo de pixels a menos: o vizinho
      // ocupa a outra metade com o raio DELE, que também cresce e encolhe.
      const folgaPx = margemCentro * camera.current.escala
      const rc = Math.max(2, Math.min(RAIO_CENTRO * escalaPonto, folgaPx * 0.5))
      // Halo curto e fraco. Ele existe para destacar o centro do emaranhado
      // de linhas atrás dele, não para iluminar a tela.
      const halo = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, rc * 2.1)
      halo.addColorStop(0, 'rgba(200,210,222,.07)')
      halo.addColorStop(1, 'rgba(200,210,222,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(ccx, ccy, rc * 2.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = COR_CENTRO
      ctx.beginPath()
      ctx.arc(ccx, ccy, rc, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      /*
       * O nome do centro obedece à mesma regra dos outros.
       *
       * Ele aparecia SEMPRE, e virava a única palavra fixa na tela — o nó já
       * se destaca por tamanho e por posição, e o rótulo permanente só cobria
       * o que estava atrás dele. Agora ele sai sob o cursor, quando a busca
       * casa, ou quando o zoom passa do limiar que o dono escolheu, como
       * qualquer nota.
       *
       * O peso continua sendo o maior de todos: QUANDO ele aparece, não cede
       * espaço a vizinho nenhum.
       */
      const centroSobCursor = sobCursor?.id === CENTRO_ID
      const centroAchado = termo !== '' && CENTRO_NOME.toLowerCase().includes(termo)
      if (!apagadoCentro && (centroSobCursor || centroAceso || centroAchado ||
        camera.current.escala > escalaDoNome)) {
        rotulos.push({ no: centro, cx: ccx, cy: ccy, r: rc, peso: Number.MAX_SAFE_INTEGER })
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
        const larg = ctx.measureText(rot.no.title).width
        const cx = rot.cx
        const cy = rot.cy - rot.r - 7
        const caixa: [number, number, number, number] =
          [cx - larg / 2 - 2, cy - 11, larg + 4, 14]
        const bate = ocupados.some(o =>
          caixa[0] < o[0] + o[2] && caixa[0] + caixa[2] > o[0] &&
          caixa[1] < o[1] + o[3] && caixa[1] + caixa[3] > o[1])
        if (bate) continue
        ocupados.push(caixa)
        ctx.fillText(rot.no.title, cx, cy)
      }
    }

    /** Caminha um passo da câmera em direção ao alvo. */
    const seguirCamera = (): boolean => {
      const alvo = alvoCamera.current
      const c = camera.current
      const perto = Math.abs(alvo.escala - c.escala) < c.escala * 0.001 &&
        Math.abs(alvo.x - c.x) * c.escala < 0.4 &&
        Math.abs(alvo.y - c.y) * c.escala < 0.4
      /*
       * A âncora manda no zoom da roda: o ponto que estava sob o cursor
       * continua sob o MESMO pixel enquanto a escala caminha. Sem ela, o zoom
       * afasta justamente daquilo que a pessoa está olhando.
       *
       * `girado` aqui não é detalhe — era um defeito de verdade. A âncora é
       * guardada em coordenadas do grafo, sem rotação (é o que `paraGrafo`
       * devolve), mas `paraTela` gira o ponto ANTES de aplicar a câmera. Com
       * a rede girada, a conta pinava o pixel errado, e como o ângulo nunca
       * volta a zero, todo zoom depois de um giro saía torto — o erro medido
       * chegou a 1806 px com 0,9 rad de rotação. Girar o ponto a cada quadro
       * põe os dois lados no mesmo espaço, e o erro vai a zero mesmo com a
       * rede rodando durante o gesto.
       */
      const anc = ancora.current
      const fixarNaAncora = (): void => {
        if (!anc) return
        const [ax, ay] = girado(anc.gx, anc.gy)
        c.x = ax - (anc.px - l / 2) / c.escala
        c.y = ay - (anc.py - a / 2) / c.escala
        alvo.x = c.x
        alvo.y = c.y
      }

      if (perto) {
        if (c.escala !== alvo.escala || c.x !== alvo.x || c.y !== alvo.y) {
          if (anc) {
            // O último quadro também respeita a âncora. Fechar com
            // `{ ...alvo }` levava a escala ao valor exato sem recolocar o
            // centro, e o desenho dava um pulinho de um pixel no fim.
            c.escala = alvo.escala
            fixarNaAncora()
          } else {
            camera.current = { ...alvo }
          }
          return true
        }
        return false
      }
      const s = suavidadeCamera.current
      c.escala += (alvo.escala - c.escala) * s
      if (anc) {
        fixarNaAncora()
      } else {
        c.x += (alvo.x - c.x) * s
        c.y += (alvo.y - c.y) * s
      }
      return true
    }

    const laco = (): void => {
      if (seguirCamera()) sujo.current = true
      if (andarGiro()) sujo.current = true

      if (pedidoDeslize.current > 0) {
        pedidoDeslize.current = 0
        deslizarAteORepouso()
      }

      if (deslize) {
        andarDeslize()
      } else if (restantes.current > 0) {
        passo()
        restantes.current--
        if (restantes.current === 0) medirLayout()
      }

      if (precisaEnquadrar.current && restantes.current === 0 && !deslize) {
        enquadrar()
        precisaEnquadrar.current = false
      }

      if (animacao.current.ativa) sujo.current = true
      // Rede parada, câmera parada, nada sob o cursor mudou: não há o que
      // redesenhar, e desenhar mesmo assim é queimar processador à toa.
      if (sujo.current) {
        sujo.current = false
        desenhar()
      }
      quadro = requestAnimationFrame(laco)
    }
    quadro = requestAnimationFrame(laco)

    /*
     * Janela escondida não anima.
     *
     * `requestAnimationFrame` já para quando a janela é minimizada, mas não
     * quando ela fica atrás de outra. Aqui o laço é cancelado de verdade.
     */
    const aoTrocarVisibilidade = (): void => {
      if (document.hidden) {
        cancelAnimationFrame(quadro)
      } else {
        sujo.current = true
        cancelAnimationFrame(quadro)
        quadro = requestAnimationFrame(laco)
      }
    }
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)

    /** O índice do nó sob o ponteiro; -1 se nenhum, -2 se for o centro. */
    const noPonto = (cx: number, cy: number): number => {
      let achado = -1
      let menor = Infinity
      // A MESMA conta do desenho, densidade inclusive: se o alvo do dedo
      // divergir do ponto desenhado, a pessoa acerta o que não está vendo.
      const densidade = Math.min(1, espacamento / ESPACAMENTO_BASE)
      const escalaPonto = Math.min(1.5, Math.max(0.6, camera.current.escala / ESCALA_BASE))
        * densidade * Math.max(0.1, ajustesRef.current.tamanhoNo)

      // O centro primeiro, e com prioridade: ele é desenhado por cima de
      // todo mundo, e o que está por cima é o que o dedo espera pegar.
      const [ccx, ccy] = paraTela(CENTRO, CENTRO)
      // O mesmo raio limitado do desenho — ver `folgaPx` em `desenhar`.
      const rc = Math.max(2, Math.min(
        RAIO_CENTRO * escalaPonto,
        margemCentro * camera.current.escala * 0.5
      ))
      if (Math.hypot(cx - ccx, cy - ccy) < Math.max(14, rc + 8)) return -2
      for (let i = 0; i < n; i++) {
        // O que o filtro escondeu não é clicável: pegar um nó invisível é
        // pior do que não pegar nada.
        if (!noFoco(i)) continue
        const [nx, ny] = paraTela(px[i], py[i])
        const d = Math.hypot(cx - nx, cy - ny)
        // Alvo mínimo de 14 px: um nó pequeno tem 2 px de raio, e acertar
        // isso com o mouse seria sorte. Não muito mais do que isso: alvo
        // grande demais faz o cursor pegar o vizinho em vez do de baixo.
        const alcance = Math.max(14, raioDe(nos[i].grau) * escalaPonto + 8)
        if (d < alcance && d < menor) { menor = d; achado = i }
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
      if (deslize) return
      const [cx, cy] = posicao(e)
      // `-2` é o centro, e segurar nele não arrasta nem move a câmera: VIRA
      // a rede. O índice atravessa o arrasto inteiro dizendo qual dos três
      // gestos está em curso — nó, giro, ou câmera.
      const i = noPonto(cx, cy)
      segurandoCentro = i === -2
      canvas.setPointerCapture(e.pointerId)
      arrastando.current = { i, px: cx, py: cy, ox: cx, oy: cy, mexeu: false }
      // A mãozinha fechada é a única vez em que o cursor muda: ela diz que
      // ALGO está sendo segurado. Fora disso a seta basta, e trocar o cursor
      // a cada nó por que se passa deixa o ponteiro piscando pela tela.
      canvas.style.cursor = 'grabbing'
      if (i >= 0) suaves.current = PASSOS_RETORNO
    }

    const aoMover = (e: PointerEvent): void => {
      const [cx, cy] = posicao(e)
      const arr = arrastando.current

      if (arr) {
        // Passou da folga? Então é arrasto, e não clique. A folga existe
        // porque a mão treme: sem ela, um clique com dois pixels de tremor
        // vira arrasto e a nota não abre.
        if (!arr.mexeu && Math.hypot(cx - arr.ox, cy - arr.oy) > FOLGA_CLIQUE) {
          arr.mexeu = true
        }
        if (arr.i >= 0) {
          const [gx, gy] = paraGrafo(cx, cy)
          px[arr.i] = gx
          py[arr.i] = gy
          // Um punhado de quadros a cada movimento: os vizinhos acompanham o
          // nó puxado em vez de ficarem congelados enquanto ele passeia. E o
          // modo suave é renovado, para não expirar no meio do arrasto.
          restantes.current = Math.max(restantes.current, PASSOS_ARRASTO)
          suaves.current = PASSOS_RETORNO
        } else {
          /*
           * Arrasto no vazio — e no nó do meio — move a câmera.
           *
           * Segurar o centro faz duas coisas ao mesmo tempo: a rede gira, e a
           * tela acompanha o ponteiro. Não são gestos concorrentes; o giro
           * vem do botão apertado e o deslocamento vem da mão andando, então
           * dá para virar a rede e passear por ela sem soltar.
           *
           * Dividido pela escala porque o deslocamento do dedo é em pixels e
           * a câmera vive no espaço do grafo — sem isso o mundo escorrega
           * mais rápido que o dedo.
           */
          camera.current.x -= (cx - arr.px) / camera.current.escala
          camera.current.y -= (cy - arr.py) / camera.current.escala
          // O alvo acompanha, senão a câmera desliza de volta no quadro
          // seguinte e o arrasto não sai do lugar.
          alvoCamera.current.x = camera.current.x
          alvoCamera.current.y = camera.current.y
          ancora.current = null
          arr.px = cx
          arr.py = cy
        }
        sujo.current = true
        return
      }

      const i = noPonto(cx, cy)
      const no = i === -2 ? centro : i >= 0 ? nos[i] : null
      if (sobreRef.current?.id !== no?.id) sujo.current = true
      sobreRef.current = no
      setSobre(atual => (atual?.id === no?.id ? atual : no))
    }

    const aoSubir = (e: PointerEvent): void => {
      const arr = arrastando.current
      if (arr && arr.i >= 0) {
        if (arr.mexeu) {
          // Arrastou: o nó volta para a física por um tempo contado e é
          // puxado na direção de onde saiu — sem chegar inteiro, porque os
          // quadros acabam antes. Ver `PASSOS_RETORNO`.
          //
          // Se ele foi largado FORA da parede, o retorno precisa durar o
          // bastante para a parede recolher o excesso; senão o nó ficaria
          // parado no vazio, longe do desenho.
          const rx = px[arr.i] - CENTRO, ry = py[arr.i] - CENTRO
          const fora = Math.sqrt(rx * rx + ry * ry) > raioParede
          const quadros = fora ? PASSOS_RETORNO * 3 : PASSOS_RETORNO
          restantes.current = Math.max(restantes.current, quadros)
          // A volta usa o MESMO passo gentil do arrasto: é o que evita o
          // tranco no instante em que o dedo levanta.
          suaves.current = Math.max(suaves.current, quadros)
        } else {
          // Tag e nota inexistente não são arquivo: não há o que abrir.
          const no = nos[arr.i]
          if (no.especie === 'nota') aoAbrir(no.id)
        }
      }
      arrastando.current = null
      // Soltou: a velocidade cai pela mesma rampa e a rede encosta no ângulo
      // em que ficou.
      segurandoCentro = false
      canvas.style.cursor = 'default'
      canvas.releasePointerCapture(e.pointerId)
      sujo.current = true
    }

    const aoSair = (): void => {
      sobreRef.current = null
      setSobre(null)
      sujo.current = true
    }

    /*
     * O zoom não salta: ele PERSEGUE um alvo.
     *
     * Cada giro da roda mexia na escala na hora, e o desenho pulava de
     * degrau em degrau. Aqui a roda mexe só no alvo, e cada quadro caminha
     * uma fração da distância até ele — o resultado é contínuo mesmo com o
     * evento chegando aos trancos, e continua respondendo na hora, porque a
     * primeira fração é a maior.
     */
    let ultimoRolar = 0
    const aoRolar = (e: WheelEvent): void => {
      e.preventDefault()
      const [cx, cy] = posicao(e)
      const agora = performance.now()

      /*
       * A âncora é do GESTO, e não do evento.
       *
       * Cada entalhe da roda recalculava que ponto do grafo estava sob o
       * cursor. Só que a escala ainda está caminhando quando o entalhe
       * seguinte chega, então o ponto sob aquele mesmo pixel já é outro — e
       * a câmera passava a perseguir uma nota diferente a cada entalhe. Era
       * isso o zoom "mudando de ângulo": ele ia trocando de alvo no meio do
       * movimento e derivava de lado.
       *
       * Enquanto o cursor fica parado e os entalhes vêm em sequência, a
       * âncora é a MESMA: o zoom entra em linha reta no ponto onde o cursor
       * estava quando o gesto começou. Mover o cursor, ou parar de rolar por
       * um quarto de segundo, começa um gesto novo.
       */
      const anc = ancora.current
      const mesmoGesto = anc !== null &&
        agora - ultimoRolar < 260 &&
        Math.hypot(cx - anc.px, cy - anc.py) < 6
      ultimoRolar = agora
      if (!mesmoGesto) {
        const [gx, gy] = paraGrafo(cx, cy)
        ancora.current = { gx, gy, px: cx, py: cy }
      }

      /*
       * O tamanho do evento conta, e não só o sinal dele.
       *
       * Um entalhe de roda manda `deltaY` de 100 (ou 3, quando o sistema
       * reporta em linhas). Um trackpad manda dezenas de eventos de 4 ou 5.
       * Tratando todo evento como um entalhe cheio, o trackpad multiplicava a
       * escala dezenas de vezes num gesto só e o desenho saltava de nota em
       * nota. Aqui cada evento vale a fração de entalhe que ele de fato é.
       */
      const unidade = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : 100
      // Teto de 2,5 entalhes: roda de rolagem acelerada manda `deltaY` de
      // 400 e mais, e sem teto um giro forte atravessava o grafo inteiro.
      const entalhes = Math.min(2.5, Math.abs(e.deltaY) / unidade || 1)
      const fator = Math.pow(PASSO_ZOOM, e.deltaY < 0 ? entalhes : -entalhes)

      suavidadeCamera.current = SUAVIDADE_ZOOM
      alvoCamera.current.escala = Math.min(
        9000, Math.max(60, alvoCamera.current.escala * fator)
      )
      sujo.current = true
    }

    /*
     * O sistema pode cancelar o ponteiro no meio do gesto — a janela perde o
     * foco, o toque vira rolagem, o dispositivo some. Sem isto, um cancelamento
     * enquanto se segura o centro deixaria a rede girando para sempre, porque
     * o `pointerup` que desliga nunca chegaria.
     */
    const aoCancelar = (): void => {
      arrastando.current = null
      segurandoCentro = false
      canvas.style.cursor = 'default'
      sujo.current = true
    }

    canvas.addEventListener('pointerdown', aoDescer)
    canvas.addEventListener('pointermove', aoMover)
    canvas.addEventListener('pointerup', aoSubir)
    canvas.addEventListener('pointercancel', aoCancelar)
    canvas.addEventListener('pointerleave', aoSair)
    canvas.addEventListener('wheel', aoRolar, { passive: false })

    return () => {
      cancelAnimationFrame(quadro)
      // As posições voltam para os objetos, e daí para a memória do módulo:
      // é o que faz trocar de lente e voltar não custar nada.
      for (let i = 0; i < n; i++) { nos[i].x = px[i]; nos[i].y = py[i] }
      memoria = {
        nos: dadosRef.current?.nos ?? nos,
        arestas: dadosRef.current?.arestas ?? grafo.arestas,
        camera: { ...camera.current }
      }
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
      window.removeEventListener('resize', aoRedimensionar)
      canvas.removeEventListener('pointerdown', aoDescer)
      canvas.removeEventListener('pointermove', aoMover)
      canvas.removeEventListener('pointerup', aoSubir)
      canvas.removeEventListener('pointercancel', aoCancelar)
      canvas.removeEventListener('pointerleave', aoSair)
      canvas.removeEventListener('wheel', aoRolar)
    }
  }, [grafo, vizinhos, ordemAnimacao, centro, aoAbrir])

  const mudar = <C extends keyof Ajustes>(campo: C, valor: Ajustes[C]): void => {
    setAjustes(a => ({ ...a, [campo]: valor }))
    // Mexer numa força tem de mexer o desenho: sem reaquecer, o grafo fica
    // parado e o controle parece quebrado.
    restantes.current = Math.max(restantes.current, PASSOS_AJUSTE)
    // No passo GENTIL: mexer num controle é ver o desenho mudar, e o desenho
    // mudando aos trancos não deixa comparar antes e depois. Com o passo
    // cheio a rede inteira se sacudia a cada arrasto do dedo no controle.
    suaves.current = Math.max(suaves.current, PASSOS_AJUSTE)
    sujo.current = true
  }

  const visiveis = grafo
    ? (foco === null ? grafo.nos.length : grafo.nos.filter(n => n.grupo === foco).length)
    : 0
  const ligados = grafo ? grafo.nos.filter(n => n.grau > 0).length : 0

  return (
    <div className="cerebro">
      <div className="cerebro-topo">
        <div className="cerebro-conta">
          {grafo
            ? <>
                <strong>{visiveis}</strong> {foco === null ? 'notas' : `em ${foco}`}
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
            onChange={e => { setBusca(e.target.value); marcarSujo() }}
          />

          <button
            className="btn-fantasma"
            onClick={() => {
              animacao.current = { ativa: true, comeco: performance.now() }
              marcarSujo()
            }}
            title="Ver a rede se formando, do nó mais ligado ao menos"
          >
            Animar
          </button>

          <button
            className="btn-fantasma"
            onClick={() => { pedidoDeslize.current = 1; marcarSujo() }}
            title="Levar cada nó de volta ao lugar de repouso"
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

        {/* A legenda é o que torna a cor legível — e o filtro. Sem ela são
            sete cores; com ela, sete pastas em que se pode entrar. */}
        {grupos.length > 0 && (
          <div className="cerebro-legenda">
            {grupos.map(g => (
              <button
                key={g.nome}
                type="button"
                className={'cerebro-grupo' + (foco === g.nome ? ' is-ativo' : '')}
                aria-pressed={foco === g.nome}
                onClick={() => setFoco(f => (f === g.nome ? null : g.nome))}
                title={foco === g.nome
                  ? 'Mostrar a rede inteira de novo'
                  : `Ver só ${g.nome} e as ligações dentro dele`}
              >
                <i style={{ background: corDaPasta(g.nome) }} />
                {g.nome} <b>{g.quantas}</b>
              </button>
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
                  onChange={e => {
                    const cor = e.target.value
                    setAjustes(a => ({ ...a, cores: { ...a.cores, [g.nome]: cor } }))
                    marcarSujo()
                  }}
                />
                <span>{g.nome}</span>
                <b>{g.quantas}</b>
              </label>
            ))}

            <button
              className="btn-fantasma cerebro-restaurar"
              onClick={() => {
                setAjustes(AJUSTES_PADRAO)
                // Deslize, e não reaquecimento: restaurar o padrão muda as
                // forças, e a rede caminha até o novo repouso em vez de se
                // sacudir até achá-lo.
                pedidoDeslize.current = 1
                marcarSujo()
              }}
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
                : sobre.especie === 'inexistente' ? 'ainda não existe'
                : sobre.especie === 'centro' ? 'o vault inteiro'
                : sobre.grupo}
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
