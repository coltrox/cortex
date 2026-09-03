import { Campainha, type Toque } from '@compartilhado/campainha'
import { CREDENCIAL, faltaCredencial } from './credencial'
import { guardadoDoNavegador } from './guardado'
import { lerVaultId } from './ajustes'

/**
 * Uma campainha só para o app inteiro, ligada ao vault do momento.
 *
 * Mora no módulo, e não num hook, porque duas telas montadas ao mesmo tempo
 * abririam dois WebSockets para o mesmo canal — o dobro de conexão para
 * ouvir exatamente a mesma coisa. Aqui as telas se inscrevem, e a conexão é
 * uma só.
 *
 * Trocar de vault em Ajustes fecha a conexão antiga e abre outra: o toque do
 * Cortex anterior não pode continuar chegando neste celular.
 */

let ligada: { id: string; campainha: Campainha } | null = null
const ouvintes = new Set<(t: Toque) => void>()

function avisar(t: Toque): void {
  // Cópia antes de percorrer: um ouvinte pode se desinscrever ao ser chamado
  // (uma tela que desmonta), e mexer no Set durante a iteração pularia o
  // vizinho.
  for (const fn of [...ouvintes]) {
    try {
      fn(t)
    } catch {
      // Um ouvinte com defeito não pode calar os outros.
    }
  }
}

/**
 * Garante a conexão certa para o vault de agora — e nenhuma, quando não há
 * vault ligado.
 */
function garantir(): Campainha | null {
  const id = lerVaultId(guardadoDoNavegador)
  if (!id || faltaCredencial()) {
    if (ligada) { ligada.campainha.fechar(); ligada = null }
    return null
  }
  if (ligada && ligada.id !== id) { ligada.campainha.fechar(); ligada = null }
  if (!ligada) {
    const campainha = new Campainha(CREDENCIAL, id, avisar)
    campainha.abrir()
    ligada = { id, campainha }
  }
  return ligada.campainha
}

/** Passa a ouvir os toques. Devolve como parar de ouvir. */
export function ouvirCampainha(fn: (t: Toque) => void): () => void {
  ouvintes.add(fn)
  garantir()
  return () => { ouvintes.delete(fn) }
}

/** Avisa o Cortex que este celular gravou alguma coisa. */
export function tocarCampainha(t: Toque): void {
  garantir()?.tocar(t)
}

/**
 * Reavalia a qual vault a conexão pertence.
 *
 * Chamado depois de conectar ou trocar de vault em Ajustes: sem isto a
 * campainha continuaria ouvindo o Cortex antigo até alguém recarregar a
 * página.
 */
export function reavaliarCampainha(): void {
  garantir()
}

/**
 * Voltou para a tela: reconecta na hora.
 *
 * `garantir()` não serve aqui — ele só cria a campainha que não existe, e a
 * que existe com o socket morto ele devolve intacta. E é justamente esse o
 * estado depois de o celular ficar em segundo plano: o sistema congela o
 * WebSocket e o timer de religar junto, e ao voltar a conexão está morta com
 * o religamento agendado para daqui a até 30 segundos. Nesse intervalo o
 * Cortex publica, toca, e não há ninguém ouvindo.
 */
export function acordarCampainha(): void {
  garantir()?.acordar()
}
