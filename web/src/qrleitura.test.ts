import { describe, it, expect } from 'vitest'
import qr from 'qrcode-generator'
import { textoDoQuadro, idDoQr } from './qrleitura'

const VAULT = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'

/**
 * Pinta um QR de verdade em RGBA, do jeito que a câmera entregaria.
 *
 * Usa o MESMO gerador que o Cortex usa para desenhar o QR na tela
 * (`qrcode-generator`, em `src/renderer/components/Qr.tsx`), então o que este
 * teste decodifica é o que o aparelho vai ver de fato — e não um QR de
 * laboratório que só este teste sabe produzir.
 *
 * A margem clara de 4 módulos não é enfeite: sem ela nenhum leitor acha o
 * código, e o teste passaria a medir a ausência dela em vez da leitura.
 */
function pintarQr(conteudo: string, ladoDoModulo = 4, margem = 4): {
  dados: Uint8ClampedArray; largura: number; altura: number
} {
  const codigo = qr(0, 'M')
  codigo.addData(conteudo)
  codigo.make()

  const n = codigo.getModuleCount()
  const lado = (n + margem * 2) * ladoDoModulo
  const dados = new Uint8ClampedArray(lado * lado * 4).fill(255)

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!codigo.isDark(y, x)) continue
      for (let dy = 0; dy < ladoDoModulo; dy++) {
        for (let dx = 0; dx < ladoDoModulo; dx++) {
          const px = (x + margem) * ladoDoModulo + dx
          const py = (y + margem) * ladoDoModulo + dy
          const i = (py * lado + px) * 4
          dados[i] = 0; dados[i + 1] = 0; dados[i + 2] = 0
        }
      }
    }
  }
  return { dados, largura: lado, altura: lado }
}

describe('decodificar o quadro', () => {
  it('le o link que o Cortex gera', () => {
    // Este e o caminho que o Safari do iPhone usa: ele nao tem
    // `BarcodeDetector`, e antes desta leitura a tela desistia -- na pratica,
    // "a camera nao abre".
    const link = `https://cortex-wapp.vercel.app/#id=${VAULT}`
    const { dados, largura, altura } = pintarQr(link)
    expect(textoDoQuadro(dados, largura, altura)).toBe(link)
  })

  it('le o id cru, que e o QR de quando nao ha endereco configurado', () => {
    const { dados, largura, altura } = pintarQr(VAULT)
    expect(textoDoQuadro(dados, largura, altura)).toBe(VAULT)
  })

  it('quadro sem QR nenhum devolve null, e nao lixo', () => {
    // O caso comum: a camera aberta apontada para a mesa. Acontece dezenas de
    // vezes por segundo, e cada um desses quadros precisa ser um nao-evento.
    const branco = new Uint8ClampedArray(64 * 64 * 4).fill(255)
    expect(textoDoQuadro(branco, 64, 64)).toBeNull()
  })
})

describe('o id dentro do QR', () => {
  it('tira o id do link', () => {
    expect(idDoQr(`https://cortex-wapp.vercel.app/#id=${VAULT}`)).toBe(VAULT)
  })

  it('aceita o id cru, e normaliza maiuscula', () => {
    expect(idDoQr(VAULT.toUpperCase())).toBe(VAULT)
  })

  it('QR de outra coisa nao vira id', () => {
    // Mirar num Pix ou num cartaz nao pode conectar o celular a coisa nenhuma.
    expect(idDoQr('https://exemplo.com/pagar?valor=50')).toBeNull()
    expect(idDoQr('00020126580014BR.GOV.BCB.PIX')).toBeNull()
    expect(idDoQr('')).toBeNull()
  })

  it('link com fragmento torto nao vira id', () => {
    // O fragmento e entrada de fora como outra qualquer: um link forjado nao
    // aponta este celular para o vault de terceiro sem passar pela validacao.
    expect(idDoQr('https://cortex-wapp.vercel.app/#id=nao-e-uuid')).toBeNull()
    expect(idDoQr('https://cortex-wapp.vercel.app/#outracoisa=1')).toBeNull()
  })
})
