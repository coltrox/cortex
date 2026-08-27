/**
 * Gera o ícone do app — build/icon.ico e build/icon.png.
 *
 * Desenha um cérebro feito de rede: nós luminosos ligados por arestas finas,
 * azul sobre fundo quase preto.
 *
 * Escrito à mão com zlib porque a alternativa era acrescentar uma biblioteca
 * de imagem inteira ao projeto. O desenho é feito uma vez em alta resolução e
 * reduzido por média de área para cada tamanho: reduzir uma imagem grande dá
 * um antialiasing muito melhor do que rasterizar direto em 16px, e é o que
 * salva o ícone pequeno de virar mingau.
 *
 * O sorteio das posições usa semente fixa — o ícone sai idêntico toda vez.
 *
 * Rode com: npm run icone
 */
const { deflateSync } = require('node:zlib')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const FUNDO = [6, 16, 30]        // azul quase preto
const NO = [125, 205, 255]       // azul claro luminoso
const NUCLEO = [235, 248, 255]   // o centro do nó, quase branco

const TAMANHOS = [16, 24, 32, 48, 64, 128, 256]
const RES = 1024                 // resolução de trabalho

/* ---------- silhueta ---------- */

/**
 * O contorno do cérebro, como união de elipses.
 *
 * Um polígono desenhado à mão daria uma borda dura; a união de elipses tem
 * a barriga arredondada certa, e testar "está dentro?" é uma conta só.
 */
const ELIPSES = [
  { x: 0.48, y: 0.40, rx: 0.29, ry: 0.20 },  // massa cerebral
  { x: 0.45, y: 0.29, rx: 0.25, ry: 0.13 },  // abóbada
  { x: 0.28, y: 0.42, rx: 0.14, ry: 0.16 },  // lobo frontal
  { x: 0.70, y: 0.39, rx: 0.16, ry: 0.17 },  // lobo occipital
  { x: 0.38, y: 0.56, rx: 0.16, ry: 0.11 },  // lobo temporal
  { x: 0.57, y: 0.55, rx: 0.15, ry: 0.10 },
  { x: 0.68, y: 0.62, rx: 0.13, ry: 0.09 },  // cerebelo
  { x: 0.58, y: 0.70, rx: 0.05, ry: 0.08 }   // tronco
]

/**
 * O recorte que separa o cerebelo do lobo temporal.
 *
 * Sem ele a silhueta vira um oval: é essa fenda embaixo à esquerda que faz o
 * contorno ser lido como cérebro, e não como uma mancha qualquer.
 */
const CORTES = [
  { x: 0.24, y: 0.74, rx: 0.20, ry: 0.14 },  // canto inferior esquerdo
  { x: 0.50, y: 0.76, rx: 0.14, ry: 0.10 },  // fenda antes do tronco
  { x: 0.88, y: 0.66, rx: 0.12, ry: 0.12 }   // canto inferior direito
]

function dentro(x, y) {
  for (const c of CORTES) {
    const dx = (x - c.x) / c.rx
    const dy = (y - c.y) / c.ry
    if (dx * dx + dy * dy <= 1) return false
  }
  for (const e of ELIPSES) {
    const dx = (x - e.x) / e.rx
    const dy = (y - e.y) / e.ry
    if (dx * dx + dy * dy <= 1) return true
  }
  return false
}

/* ---------- grafo ---------- */

/** PRNG com semente: o desenho precisa ser o mesmo em toda execução. */
function prng(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Espalha nós dentro da silhueta, com distância mínima entre eles.
 *
 * Sem a distância mínima, o sorteio agrupa uns em cima dos outros e some com
 * a sensação de malha regular que a imagem tem.
 */
/**
 * Dois níveis de detalhe.
 *
 * O desenho cheio tem 70 nós — lindo em 48px ou mais, e uma mancha azul em
 * 16px, porque nó e aresta caem abaixo de um pixel. Ícone bom troca de
 * desenho conforme o tamanho, em vez de encolher o mesmo até sumir: nos
 * tamanhos pequenos entram poucos nós grandes, que sobrevivem à redução e
 * ainda leem como "rede".
 */
const DETALHE = {
  quantos: 70, minimo: 0.050, raio: 0.0075, variacao: 0.0065,
  aresta: 0.0022, halo: 0.015, central: 0.030
}

function semearNos(d) {
  const rnd = prng(20260827)
  const nos = []
  const MIN = d.minimo
  for (let tentativa = 0; tentativa < 40000 && nos.length < d.quantos; tentativa++) {
    const x = 0.13 + rnd() * 0.74
    const y = 0.14 + rnd() * 0.66
    if (!dentro(x, y)) continue
    if (nos.some(n => Math.hypot(n.x - x, n.y - y) < MIN)) continue
    nos.push({ x, y, r: d.raio + rnd() * d.variacao })
  }

  // O nó central: maior e mais brilhante, o ponto de convergência da rede.
  let central = 0
  let melhor = Infinity
  nos.forEach((n, i) => {
    const d = Math.hypot(n.x - 0.47, n.y - 0.47)
    if (d < melhor) { melhor = d; central = i }
  })
  nos[central].r = d.central
  nos[central].nucleo = true
  return nos
}

/** Liga cada nó aos vizinhos mais próximos, sem arestas longas atravessando. */
function tecerArestas(nos, alcance) {
  const arestas = []
  const vistas = new Set()
  nos.forEach((a, i) => {
    const perto = nos
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter(v => v.j !== i && v.d < alcance)
      .sort((p, q) => p.d - q.d)
      .slice(0, a.nucleo ? 8 : 3)
    for (const v of perto) {
      const chave = i < v.j ? `${i}-${v.j}` : `${v.j}-${i}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
      arestas.push([i, v.j])
    }
  })
  return arestas
}

/* ---------- rasterização ---------- */

function distSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function dentroDaBase(x, y) {
  const r = 0.20
  const dx = Math.max(r - x, 0, x - (1 - r))
  const dy = Math.max(r - y, 0, y - (1 - r))
  return Math.hypot(dx, dy) <= r
}

/**
 * Desenha em RES×RES.
 *
 * A luz é acumulada num buffer separado antes de virar cor: é isso que faz
 * dois nós próximos somarem brilho, como acontece num desenho com glow, em
 * vez de um simplesmente pintar por cima do outro.
 */
function desenhar(d) {
  const nos = semearNos(d)
  const arestas = tecerArestas(nos, d.minimo * 3.2)
  const luz = new Float32Array(RES * RES)
  const nucleo = new Float32Array(RES * RES)

  // Halo curto e aresta com presença: com halo largo os nós incham e viram
  // bolhas, e a malha — que é o assunto do desenho — some por baixo delas.
  const LARG_ARESTA = d.aresta
  const HALO = d.halo

  for (let py = 0; py < RES; py++) {
    const y = (py + 0.5) / RES
    for (let px = 0; px < RES; px++) {
      const x = (px + 0.5) / RES
      const i = py * RES + px
      let e = 0
      let c = 0

      for (const [a, b] of arestas) {
        const dist = distSegmento(x, y, nos[a].x, nos[a].y, nos[b].x, nos[b].y)
        if (dist > LARG_ARESTA * 5) continue
        if (dist <= LARG_ARESTA) e += 0.95
        else e += 0.22 * Math.exp(-(dist * dist) / (LARG_ARESTA * 2.2 * LARG_ARESTA * 2.2))
      }

      for (const n of nos) {
        const dist = Math.hypot(x - n.x, y - n.y)
        if (dist > HALO * 2.2 + n.r) continue
        if (dist <= n.r) { e += 1.6; c += 1 }
        else {
          const s = n.nucleo ? HALO * 2.0 : HALO
          e += 0.6 * Math.exp(-((dist - n.r) * (dist - n.r)) / (s * s))
        }
      }

      luz[i] = e
      nucleo[i] = c
    }
  }

  // Composição: a energia acumulada vira a mistura entre fundo e azul, e o
  // miolo dos nós puxa para o branco.
  const px = Buffer.alloc(RES * RES * 4)
  for (let py = 0; py < RES; py++) {
    for (let x = 0; x < RES; x++) {
      const i = py * RES + x
      const t = Math.min(1, luz[i])
      const b = Math.min(1, nucleo[i])
      const o = i * 4
      for (let k = 0; k < 3; k++) {
        const azul = FUNDO[k] + (NO[k] - FUNDO[k]) * t
        px[o + k] = Math.round(azul + (NUCLEO[k] - azul) * b)
      }
      px[o + 3] = dentroDaBase((x + 0.5) / RES, (py + 0.5) / RES) ? 255 : 0
    }
  }
  return px
}

/**
 * A versão para tamanhos minúsculos: a silhueta preenchida.
 *
 * Tentei antes manter a malha com poucos nós grandes, e o resultado em 16px
 * era um amontoado desconexo — a forma se perdia. Abaixo de 32px não há
 * pixels para desenhar uma rede: o que lê instantaneamente é o contorno
 * cheio. Alguns pontos claros por cima preservam a ideia sem competir com a
 * silhueta.
 */
function desenharSolido() {
  const px = Buffer.alloc(RES * RES * 4)
  const pontos = [
    { x: 0.47, y: 0.47, r: 0.055 },
    { x: 0.30, y: 0.36, r: 0.030 },
    { x: 0.66, y: 0.33, r: 0.030 },
    { x: 0.66, y: 0.62, r: 0.030 }
  ]

  for (let py = 0; py < RES; py++) {
    const y = (py + 0.5) / RES
    for (let x = 0; x < RES; x++) {
      const fx = (x + 0.5) / RES
      const i = (py * RES + x) * 4
      const corpo = dentro(fx, y) ? 1 : 0
      let brilho = 0
      for (const p of pontos) {
        const d = Math.hypot(fx - p.x, y - p.y)
        if (d <= p.r) brilho = 1
      }
      for (let k = 0; k < 3; k++) {
        const azul = FUNDO[k] + (NO[k] - FUNDO[k]) * corpo
        px[i + k] = Math.round(azul + (NUCLEO[k] - azul) * brilho * corpo)
      }
      px[i + 3] = dentroDaBase(fx, y) ? 255 : 0
    }
  }
  return px
}

/** Reduz por média de área — o antialiasing que salva o ícone de 16px. */
function reduzir(fonte, lado) {
  const destino = Buffer.alloc(lado * lado * 4)
  const passo = RES / lado
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const x0 = Math.floor(x * passo)
      const x1 = Math.floor((x + 1) * passo)
      const y0 = Math.floor(y * passo)
      const y1 = Math.floor((y + 1) * passo)
      const soma = [0, 0, 0, 0]
      let n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * RES + sx) * 4
          for (let k = 0; k < 4; k++) soma[k] += fonte[o + k]
          n++
        }
      }
      const o = (y * lado + x) * 4
      for (let k = 0; k < 4; k++) destino[o + k] = Math.round(soma[k] / n)
    }
  }
  return destino
}

/* ---------- PNG ---------- */

const TABELA_CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

function png(lado, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(lado, 0)
  ihdr.writeUInt32BE(lado, 4)
  ihdr[8] = 8    // bits por canal
  ihdr[9] = 6    // RGBA
  // Cada scanline leva um byte de filtro na frente; 0 = sem filtro.
  const linhas = []
  for (let y = 0; y < lado; y++) {
    linhas.push(Buffer.from([0]), px.subarray(y * lado * 4, (y + 1) * lado * 4))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    bloco('IEND', Buffer.alloc(0))
  ])
}

/* ---------- ICO ---------- */

function ico(imagens) {
  const cabecalho = Buffer.alloc(6)
  cabecalho.writeUInt16LE(0, 0)               // reservado
  cabecalho.writeUInt16LE(1, 2)               // 1 = ícone
  cabecalho.writeUInt16LE(imagens.length, 4)

  const entradas = []
  let deslocamento = 6 + imagens.length * 16
  for (const { lado, dados } of imagens) {
    const e = Buffer.alloc(16)
    // 256 é gravado como 0: o campo tem um byte só.
    e[0] = lado >= 256 ? 0 : lado
    e[1] = lado >= 256 ? 0 : lado
    e[2] = 0                                  // cores da paleta
    e[3] = 0                                  // reservado
    e.writeUInt16LE(1, 4)                     // planos
    e.writeUInt16LE(32, 6)                    // bits por pixel
    e.writeUInt32LE(dados.length, 8)
    e.writeUInt32LE(deslocamento, 12)
    deslocamento += dados.length
    entradas.push(e)
  }
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map(i => i.dados)])
}

/* ---------- saída ---------- */

const destino = join(__dirname, '..', 'build')
mkdirSync(destino, { recursive: true })

// Abaixo de 32px o desenho cheio vira mancha; ali entra a versão de poucos
// nós grandes. O corte é em 32 porque é onde o teste visual mostrou a malha
// deixando de ser legível.
const LIMITE_SIMPLIFICADO = 32

const cheio = desenhar(DETALHE)
const simples = desenharSolido()

const imagens = TAMANHOS.map(lado => ({
  lado,
  dados: png(lado, reduzir(lado < LIMITE_SIMPLIFICADO ? simples : cheio, lado))
}))
writeFileSync(join(destino, 'icon.ico'), ico(imagens))
writeFileSync(join(destino, 'icon.png'), png(512, reduzir(cheio, 512)))

console.log(`icon.ico com ${TAMANHOS.join(', ')} px`)
console.log(`  desenho simplificado abaixo de ${LIMITE_SIMPLIFICADO}px`)
console.log('icon.png 512x512')
