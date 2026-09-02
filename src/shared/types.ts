export interface WikiLink {
  target: string
  alias?: string
  anchor?: string
  line: number
}

export interface TaskItem {
  text: string
  done: boolean
  line: number
  due?: string
}

export interface ParsedNote {
  frontmatter: Record<string, unknown>
  body: string
  parseError: string | null
  links: WikiLink[]
  tasks: TaskItem[]
}

export interface NoteRow {
  path: string
  title: string
  tipo: string
  project: string | null
  status: string | null
  created: string | null
  updated: string | null
  date: string | null
  mtime: number
  size: number
  parseError: string | null
}

/**
 * Config do vault como o renderer a enxerga. Espelha `ConfigParaRenderer`
 * de `main/config.ts`, e é a definição única deste formato — o renderer
 * apelida esta, não redeclara outra.
 *
 * Repare no que NÃO está aqui: `vaultId`, as credenciais da nuvem e o
 * segredo da senha. Eles vivem no processo principal e não atravessam a
 * fronteira. Acrescentar um campo aqui sem acrescentá-lo à lista branca de
 * `projetarConfigParaRenderer` não faz nada; acrescentar nos dois é uma
 * decisão de segurança, não um detalhe de tipo.
 */
export type ConfigVault = {
  areas: string[]
  pastasDev: string[]
  escolheu: boolean
  /** Quais painéis pedem a senha para abrir. */
  paineisTrancados: string[]
  /** Se existe senha cadastrada. O segredo em si nunca cruza a fronteira. */
  temSenha: boolean
  /**
   * A frase de lembrete da senha.
   *
   * Esta atravessa, ao contrário do hash: ela nasceu para ser lida por quem
   * está diante do cadeado, e é o único socorro que existe — não há
   * recuperação. Vazia quando não há senha.
   */
  dicaSenha: string
}

/** O que os canais privilegiados devolvem sobre o vault aberto. */
export type EstadoVault = { root: string | null; config: ConfigVault | null }

/**
 * Um `npm run` que o Cortex esta rodando.
 *
 * Declarado aqui, e nao importado de main/dev/processos, porque este arquivo
 * e a fronteira compartilhada: o renderer nao deve importar nada de `main`.
 */
export type ProcessoInfo = {
  id: string
  raiz: string
  script: string
  pid: number | null
  /** O endereco que o servidor imprimiu ao subir, quando imprimiu. */
  url: string | null
  /** `null` enquanto roda; o codigo de saida depois que termina. */
  saiu: number | null
}

declare global {
  interface Window {
    vaultApi: {
      invoke(canal: string, payload: unknown): Promise<unknown>
      estadoVault(): Promise<EstadoVault>
      pickVault(): Promise<EstadoVault | null>
      criarVault(): Promise<EstadoVault | null>
      autorizarPastaDev(): Promise<string[]>
      caminhoArrastado(f: File): string
      autorizarPastaArrastada(caminho: string): Promise<string[]>
      abrirTerminal(raiz: string, sub?: string): Promise<{ cwd: string }>
      abrirNoExplorador(raiz: string, sub?: string): Promise<{ ok: true }>

      /* Rodar o projeto de dentro do app. Ver main/dev/processos.ts. */
      scriptsDoProjeto(raiz: string, sub?: string): Promise<{ scripts: string[] }>
      rodarScript(raiz: string, script: string, sub?: string): Promise<ProcessoInfo>
      pararProcesso(id: string): Promise<{ ok: true }>
      listarProcessos(): Promise<{ processos: ProcessoInfo[] }>
      saidaDoProcesso(id: string): Promise<{ linhas: string[] }>
      limparEncerrados(): Promise<{ processos: ProcessoInfo[] }>
      abrirNoVsCode(raiz: string, sub?: string): Promise<{ ok: boolean; motivo?: string }>
      onVaultChange(cb: (rel: string) => void): () => void
      onVaultAberto(cb: (e: EstadoVault) => void): () => void
    }
  }
}
export {}
