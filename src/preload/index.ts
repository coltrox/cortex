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

  /**
   * A versão do app.
   *
   * Canal próprio, e não junto da config do vault: aquela projeção é uma
   * lista branca de segurança — o que passa por ela é decisão sobre o que o
   * renderer PODE saber do vault. Versão não é dado do vault, é do programa,
   * e misturar as duas coisas embaçaria o critério de lá.
   */
  versaoDoApp(): Promise<string> {
    return ipcRenderer.invoke('app:versao')
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
  /*
   * Cria um projeto em Área de Trabalho\projetos. A tela manda só o modelo, a
   * linguagem e o nome; os comandos são montados no processo principal.
   */
  novoProjeto(
    modelo: import('../shared/types').ModeloProjeto,
    linguagem: import('../shared/types').LinguagemProjeto,
    nome: string
  ): Promise<import('../shared/types').ProjetoCriado> {
    return ipcRenderer.invoke('dev:novo-projeto', { modelo, linguagem, nome })
  },
  /** Grava o CLAUDE.md na raiz do vault. O texto é montado no processo principal. */
  instrucoesClaude(): Promise<{ criado: boolean; caminho: string }> {
    return ipcRenderer.invoke('vault:instrucoes-claude')
  },

  /*
   * As preferências de tela, gravadas pelo processo principal.
   *
   * Canal próprio em vez de `localStorage` porque o armazenamento local NÃO
   * FUNCIONA no app instalado: a janela carrega por `file://`, origem opaca
   * para o Chromium, e ele recusa gravar ali. Ver `main/prefs.ts`.
   */
  lerPrefs(): Promise<Record<string, string>> {
    return ipcRenderer.invoke('pref:ler', {}) as Promise<Record<string, string>>
  },
  gravarPref(chave: string, valor: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke('pref:gravar', { chave, valor }) as Promise<{ ok: true }>
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
