import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcPayload } from '../shared/ipc'

const api = {
  invoke<C extends IpcChannel>(canal: C, payload: IpcPayload<C>): Promise<unknown> {
    return ipcRenderer.invoke(canal, payload)
  },
  pickVault(): Promise<{ root: string } | null> {
    return ipcRenderer.invoke('vault:pick')
  },
  onVaultChange(cb: (rel: string) => void): () => void {
    const h = (_e: unknown, rel: string): void => cb(rel)
    ipcRenderer.on('vault:changed', h)
    return () => { ipcRenderer.off('vault:changed', h) }
  }
}

contextBridge.exposeInMainWorld('vaultApi', api)
export type VaultApi = typeof api
