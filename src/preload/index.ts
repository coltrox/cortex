import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcPayload } from '../shared/ipc'

export type EstadoVault = {
  root: string | null
  config: { areas: string[]; pastasDev: string[]; escolheu: boolean } | null
}

const api = {
  invoke<C extends IpcChannel>(canal: C, payload: IpcPayload<C>): Promise<unknown> {
    return ipcRenderer.invoke(canal, payload)
  },

  /** Estado atual — usado na abertura, quando o app reabre o último vault sozinho. */
  estadoVault(): Promise<EstadoVault> {
    return ipcRenderer.invoke('vault:state')
  },
  pickVault(): Promise<EstadoVault | null> {
    return ipcRenderer.invoke('vault:pick')
  },
  criarVault(): Promise<EstadoVault | null> {
    return ipcRenderer.invoke('vault:create')
  },

  /** Abre o diálogo nativo e devolve a lista de pastas autorizadas já atualizada. */
  autorizarPastaDev(): Promise<string[]> {
    return ipcRenderer.invoke('dev:add-folder')
  },
  abrirTerminal(raiz: string, sub = ''): Promise<{ cwd: string }> {
    return ipcRenderer.invoke('dev:terminal', { raiz, sub })
  },
  abrirNoExplorador(raiz: string, sub = ''): Promise<{ ok: true }> {
    return ipcRenderer.invoke('dev:reveal', { raiz, sub })
  },

  onVaultChange(cb: (rel: string) => void): () => void {
    const h = (_e: unknown, rel: string): void => cb(rel)
    ipcRenderer.on('vault:changed', h)
    return () => { ipcRenderer.off('vault:changed', h) }
  },
  /** O main abre o último vault sozinho e avisa por aqui quando termina. */
  onVaultAberto(cb: (e: EstadoVault) => void): () => void {
    const h = (_e: unknown, estado: EstadoVault): void => cb(estado)
    ipcRenderer.on('vault:aberto', h)
    return () => { ipcRenderer.off('vault:aberto', h) }
  }
}

contextBridge.exposeInMainWorld('vaultApi', api)
export type VaultApi = typeof api
