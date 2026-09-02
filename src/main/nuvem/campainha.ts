import { Campainha, type Toque } from '../../shared/campainha'
import { credencialDe, type Credencial } from './credencial'

/**
 * A campainha do lado do Cortex: uma por vault aberto.
 *
 * ## Por que aqui, e não no renderer
 *
 * O renderer roda com `connect-src 'none'` — ele não abre conexão para lugar
 * nenhum, e é assim de propósito: é a superfície que carrega markdown de
 * dentro do vault, e tratá-la como entrada hostil é o que segura o resto do
 * desenho. Abrir um WebSocket de lá custaria furar essa regra para ganhar
 * uma latência. Aqui no processo principal a conexão sai sem tocar nela.
 *
 * ## Quem toca, quem ouve
 *
 * O Cortex TOCA depois de publicar (o celular busca na hora) e OUVE o toque
 * do celular (puxa os eventos na hora, em vez de esperar dois minutos).
 * Nenhum dado atravessa o toque — ver `src/shared/campainha.ts`.
 */

let ligada: Campainha | null = null
/**
 * O que fazer quando tocar, guardado desde a primeira ligação.
 *
 * Existe para `religarCampainha`: quem troca o id do vault é um handler de
 * IPC, e ele não tem como conhecer esse retorno de chamada — ele mora em
 * `index.ts`, que importa os handlers. Guardar aqui evita o ciclo.
 */
let aoTocarGuardado: ((t: Toque) => void) | null = null

export function ligarCampainha(
  config: { vaultId: string; nuvem: Credencial | null },
  aoTocar: (t: Toque) => void
): void {
  // Trocar de vault sem fechar o anterior deixaria o Cortex ouvindo dois
  // canais e puxando eventos de um vault que não está mais aberto.
  desligarCampainha()
  aoTocarGuardado = aoTocar
  const cred = credencialDe(config)
  if (!cred || !config.vaultId) return
  ligada = new Campainha(cred, config.vaultId, aoTocar)
  ligada.abrir()
}

/**
 * Passa a ouvir o canal do id novo.
 *
 * Trocar o id do vault é o que revoga um celular; sem isto o Cortex
 * continuaria ouvindo o canal antigo — justamente o que a troca quis cortar.
 */
export function religarCampainha(config: { vaultId: string; nuvem: Credencial | null }): void {
  if (aoTocarGuardado) ligarCampainha(config, aoTocarGuardado)
}

/** Avisa o celular que o Cortex publicou. Sem vault aberto, não faz nada. */
export function tocarCampainha(t: Toque): void {
  ligada?.tocar(t)
}

export function desligarCampainha(): void {
  ligada?.fechar()
  ligada = null
}
