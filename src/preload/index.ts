import type { ProcessoInfo } from '../shared/types'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcChannel, IpcPayload } from '../shared/ipc'
// Reexportado de `shared/types.ts`, e não redeclarado aqui: duas cópias do
// mesmo formato são exatamente o tipo de duplicação que deixou o processo
// principal mandar `Config` inteira (com a chave da nuvem) para um canal
// tipado como se levasse só `areas`/`pastasDev`/`escolheu` — o tipo "batia"
// porque cada lado tinha o seu, não porque alguém garantisse que eram o
// mesmo. Ver `projetarConfigParaRenderer` em `main/config.ts`.
import type { EstadoVault } from '../shared/types'
export type { EstadoVault }

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
  /**
   * Caminho real de um arquivo/pasta que o usuário arrastou para a janela.
   *
   * `File.path` não existe mais no Electron moderno; `webUtils` é o caminho
   * oficial e vive no preload, não no renderer. O renderer recebe uma string
   * — e ela ainda passa pela confirmação do processo principal antes de
   * virar autorização, porque "arrastei sem querer" tem que ser recuperável.
   */
  caminhoArrastado(f: File): string {
    try { return webUtils.getPathForFile(f) } catch { return '' }
  },
  autorizarPastaArrastada(caminho: string): Promise<string[]> {
    return ipcRenderer.invoke('dev:add-dropped', { caminho })
  },
  abrirTerminal(raiz: string, sub = ''): Promise<{ cwd: string }> {
    return ipcRenderer.invoke('dev:terminal', { raiz, sub })
  },
  abrirNoExplorador(raiz: string, sub = ''): Promise<{ ok: true }> {
    return ipcRenderer.invoke('dev:reveal', { raiz, sub })
  },

  /*
   * Rodar o projeto de dentro do app.
   *
   * Canais privilegiados, como os de cima: eles nao passam pelo `invoke`
   * generico porque nao sao operacao de nota, e por isso nao tem schema em
   * shared/ipc.ts -- a validacao deles vive no processo principal, que e onde
   * o caminho e resolvido contra a lista de pastas autorizadas.
   */
  scriptsDoProjeto(raiz: string, sub = ''): Promise<{ scripts: string[] }> {
    return ipcRenderer.invoke('dev:scripts', { raiz, sub })
  },
  rodarScript(raiz: string, script: string, sub = ''): Promise<ProcessoInfo> {
    return ipcRenderer.invoke('dev:rodar', { raiz, script, sub })
  },
  pararProcesso(id: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke('dev:parar', { id })
  },
  listarProcessos(): Promise<{ processos: ProcessoInfo[] }> {
    return ipcRenderer.invoke('dev:processos')
  },
  saidaDoProcesso(id: string): Promise<{ linhas: string[] }> {
    return ipcRenderer.invoke('dev:saida', { id })
  },
  limparEncerrados(): Promise<{ processos: ProcessoInfo[] }> {
    return ipcRenderer.invoke('dev:limpar-encerrados')
  },
  abrirNoVsCode(raiz: string, sub = ''): Promise<{ ok: boolean; motivo?: string }> {
    return ipcRenderer.invoke('dev:vscode', { raiz, sub })
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
