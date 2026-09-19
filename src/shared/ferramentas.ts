/**
 * As ferramentas de que os projetos novos dependem, e como instalar cada uma.
 *
 * Fica em `shared` porque os dois lados usam: o processo principal confere se
 * a ferramenta existe e, se não, recusa com `avisoDeFalta`; a tela reconhece
 * esse aviso (`lerFalta`) e mostra a ajuda para instalar — link do site
 * oficial e o comando do winget. Pedido do dono: "avisa que não tem
 * instalado e ajuda a instalar".
 */
export type Ferramenta = {
  /** Como a pessoa conhece: "Python", "SDK do .NET". */
  nome: string
  /** A página oficial de download. */
  url: string
  /** O id no winget, o instalador de programas do Windows — um comando e pronto. */
  winget?: string
  /** O que costuma dar errado na instalação, dito antes. */
  dica?: string
}

export const FERRAMENTAS: Record<string, Ferramenta> = {
  git: { nome: 'Git', url: 'https://git-scm.com/downloads/win', winget: 'Git.Git' },
  claude: {
    nome: 'Claude Code', url: 'https://docs.claude.com/pt/docs/claude-code/setup',
    dica: 'Com o Node.js instalado, num terminal: npm install -g @anthropic-ai/claude-code'
  },
  npm: { nome: 'Node.js', url: 'https://nodejs.org/pt/download', winget: 'OpenJS.NodeJS.LTS' },
  npx: { nome: 'Node.js', url: 'https://nodejs.org/pt/download', winget: 'OpenJS.NodeJS.LTS' },
  python: {
    nome: 'Python', url: 'https://www.python.org/downloads/', winget: 'Python.Python.3.12',
    dica: 'Pelo site, marque "Add python.exe to PATH" na primeira tela do instalador.'
  },
  dotnet: { nome: 'SDK do .NET', url: 'https://dotnet.microsoft.com/pt-br/download', winget: 'Microsoft.DotNet.SDK.8' },
  mvn: {
    nome: 'Maven', url: 'https://maven.apache.org/download.cgi',
    dica: 'Precisa do JDK (Java) também. O Maven vem num zip: extraia e ponha a pasta bin no PATH do Windows.'
  },
  go: { nome: 'Go', url: 'https://go.dev/dl/', winget: 'GoLang.Go' },
  cargo: { nome: 'Rust', url: 'https://rustup.rs/', winget: 'Rustlang.Rustup' },
  composer: {
    nome: 'PHP e Composer', url: 'https://getcomposer.org/download/',
    dica: 'O Composer precisa do PHP antes: windows.php.net/download.'
  },
  rails: {
    nome: 'Ruby on Rails', url: 'https://rubyinstaller.org/downloads/',
    dica: 'Instale o Ruby (com DevKit) e depois, num terminal: gem install rails'
  },
  flutter: { nome: 'Flutter', url: 'https://docs.flutter.dev/get-started/install/windows' }
}

/** O começo do aviso que a tela reconhece para mostrar a ajuda. */
const MARCA = /^\[falta:([a-z]+)\] ([\s\S]*)$/

/** O aviso de ferramenta faltando. Leva uma marca no começo para a tela reconhecer. */
export function avisoDeFalta(comando: string): string {
  const f = FERRAMENTAS[comando]
  return f
    ? `[falta:${comando}] ${f.nome} não está instalado neste computador.`
    : `[falta:${comando}] ${comando} não está instalado neste computador.`
}

/** Se a mensagem é um aviso de ferramenta faltando: qual ferramenta, e o texto sem a marca. */
export function lerFalta(mensagem: string): { comando: string; texto: string; ferramenta?: Ferramenta } | null {
  const m = MARCA.exec(mensagem)
  return m ? { comando: m[1], texto: m[2], ferramenta: FERRAMENTAS[m[1]] } : null
}

/** O comando do winget para instalar, pronto para colar num terminal. */
export function comandoWinget(f: Ferramenta): string | null {
  return f.winget ? `winget install -e --id ${f.winget}` : null
}
