/**
 * Gera o ícone do app — build/icon.ico e build/icon.png.
 *
 * Escrito à mão com zlib porque a alternativa era acrescentar uma biblioteca
 * de imagem inteira ao projeto para desenhar cinco círculos e quatro linhas.
 * O ICO carrega vários tamanhos: o Windows escolhe o mais próximo, e um único
 * 256x256 reduzido na marra vira borrão na barra de tarefas.
 *
 * Rode com: npm run icone
 */
const { deflateSync } = require('node:zlib')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const FUNDO = [31, 34, 36]      // quase preto, quente
const TRACO = [251, 251, 250]   // o --canvas do app
const TAMANHOS = [16, 24, 32, 48, 64, 128, 256]

/* ---------- desenho ---------- */

/**
 * A marca: um nó central ligado a quatro satélites.
 * Coordenadas em fração do lado, para valer em qualquer tamanho.
 */
const CENTRO = { x: 0.5, y: 0.5, r: 0.115 }
const SATELITES = [
  { x: 0.5, y: 0.185, r: 0.075 },
  { x: 0.815, y: 0.5, r: 0.075 },
  { x: 0.5, y: 0.815, r: 0.075 },
  { x: 0.185, y: 0.5, r: 0.075 }
]
const LINHA = 0.026

/** Distância de um ponto ao segmento AB — é o que dá espessura à ligação. */
function distSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Quanto do traço cobre este ponto: 1 dentro, 0 fora. */
function cobertura(x, y) {
  for (const c of [CENTRO, ...SATELITES]) {
    if (Math.hypot(x - c.x, y - c.y) <= c.r) return 1
  }
  for (const s of SATELITES) {
    if (distSegmento(x, y, CENTRO.x, CENTRO.y, s.x, s.y) <= LINHA) return 1
  }
  return 0
}

/** Cantos arredondados, para o ícone não ser um quadrado duro. */
function dentroDaBase(x, y) {
  const r = 0.22
  const dx = Math.max(r - x, 0, x - (1 - r))
  const dy = Math.max(r - y, 0, y - (1 - r))
  return Math.hypot(dx, dy) <= r
}

/**
 * Rasteriza em RGBA. Supersampling 4x4 por pixel: sem isso as bordas dos
 * círculos ficam serrilhadas, o que aparece muito no ícone de 16px.
 */
function rasterizar(lado) {
  const px = Buffer.alloc(lado * lado * 4)
  const AMOSTRAS = 4
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let base = 0
      let traco = 0
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const fx = (x + (sx + 0.5) / AMOSTRAS) / lado
          const fy = (y + (sy + 0.5) / AMOSTRAS) / lado
          if (!dentroDaBase(fx, fy)) continue
          base++
          traco += cobertura(fx, fy)
        }
      }
      const total = AMOSTRAS * AMOSTRAS
      const alfa = base / total
      const mistura = base === 0 ? 0 : traco / base
      const i = (y * lado + x) * 4
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(FUNDO[c] + (TRACO[c] - FUNDO[c]) * mistura)
      }
      px[i + 3] = Math.round(alfa * 255)
    }
  }
  return px
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

const imagens = TAMANHOS.map(lado => ({ lado, dados: png(lado, rasterizar(lado)) }))
writeFileSync(join(destino, 'icon.ico'), ico(imagens))

const grande = imagens.find(i => i.lado === 256)
writeFileSync(join(destino, 'icon.png'), grande.dados)

console.log(`icon.ico com ${TAMANHOS.join(', ')} px`)
console.log(`icon.png 256x256 (${grande.dados.length} bytes)`)
