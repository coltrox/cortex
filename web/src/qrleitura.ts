import jsQR from 'jsqr'
import { ehIdDeVault, idDoFragmento } from './ajustes'

/**
 * A leitura do QR, separada da tela.
 *
 * Mora fora de `LerQr.tsx` para poder ser testada: um `.tsx` com câmera e
 * `requestAnimationFrame` dentro não roda no vitest, e o que precisa de prova
 * aqui não é o vídeo — é que um QR do Cortex vira o id certo, e que um QR de
 * outra coisa não vira nada.
 */

/**
 * Decodifica um quadro já em RGBA.
 *
 * `dontInvert`: o QR do Cortex é escuro sobre branco, sempre. Tentar também a
 * versão invertida dobraria o trabalho por quadro para nunca acertar.
 */
export function textoDoQuadro(
  dados: Uint8ClampedArray, largura: number, altura: number
): string | null {
  return jsQR(dados, largura, altura, { inversionAttempts: 'dontInvert' })?.data ?? null
}

/**
 * Extrai o id do que veio no QR.
 *
 * Aceita as duas formas que o Cortex gera: o link (`https://…/#id=<uuid>`) e
 * o id cru, para quando o endereço do app ainda não foi configurado lá.
 *
 * Devolve `null` para qualquer outra coisa — um Pix, um site — e quem chama
 * continua procurando em vez de acusar erro: a pessoa pode ter mirado no
 * lugar errado.
 */
export function idDoQr(bruto: string): string | null {
  const doLink = bruto.includes('#')
    ? idDoFragmento(bruto.slice(bruto.indexOf('#')))
    : null
  return doLink ?? (ehIdDeVault(bruto) ? bruto.trim().toLowerCase() : null)
}
