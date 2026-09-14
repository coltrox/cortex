import { useEffect, useState } from 'react'
import type { LinguagemProjeto, ModeloProjeto } from '../../shared/types'

/**
 * De que lado a aplicação fica.
 *
 * Etiqueta no cartão, e não um passo a mais para escolher: cada aplicação já é
 * de um lado só, e perguntar "frontend ou backend" antes seria uma decisão que
 * o cartão responde sozinho.
 */
export type Lado = 'Frontend' | 'Backend' | 'Full-stack' | 'Mobile' | 'Desktop' | 'Terminal' | 'Biblioteca'

type Modelo = { id: ModeloProjeto; nome: string; lado: Lado; descricao: string }

type Grupo = {
  id: string
  nome: string
  /** Pergunta TypeScript ou JavaScript. */
  ts: boolean
  /** Outras palavras que acham o grupo na busca: "golang", "dotnet", "spring". */
  apelidos: string
  modelos: Modelo[]
}

/**
 * As aplicações, agrupadas pela linguagem.
 *
 * Pedido do dono: primeiro "criar uma aplicação em Python", e só então as
 * opções daquela linguagem. A linguagem se escolhe numa lista em cascata com
 * busca — com tantas, botões lado a lado não cabem.
 */
export const GRUPOS: Grupo[] = [
  {
    id: 'js', nome: 'JavaScript / TypeScript', ts: true, apelidos: 'js ts node react web',
    modelos: [
      { id: 'vite', nome: 'React + Vite', lado: 'Frontend', descricao: 'Site ou app web com React. Abre no navegador.' },
      { id: 'vue', nome: 'Vue', lado: 'Frontend', descricao: 'Site ou app web com Vue e Vite.' },
      { id: 'svelte', nome: 'Svelte', lado: 'Frontend', descricao: 'Site ou app web com Svelte e Vite.' },
      { id: 'node-api', nome: 'API com Express', lado: 'Backend', descricao: 'Servidor Node com Express, pronto para receber requisições.' },
      { id: 'next', nome: 'Next.js', lado: 'Full-stack', descricao: 'Site com React e servidor junto, pronto para publicar na Vercel.' },
      { id: 'expo', nome: 'Expo', lado: 'Mobile', descricao: 'App de celular com React Native. Abre no Expo Go pelo QR code.' },
      { id: 'electron', nome: 'Electron', lado: 'Desktop', descricao: 'App de computador (Windows, Mac, Linux) com Electron Forge e Vite.' }
    ]
  },
  {
    id: 'python', nome: 'Python', ts: false, apelidos: 'py',
    modelos: [
      { id: 'flask', nome: 'Site com Flask', lado: 'Full-stack', descricao: 'Servidor web leve que já devolve as páginas. Bom para começar.' },
      { id: 'fastapi', nome: 'API com FastAPI', lado: 'Backend', descricao: 'API web moderna, com a documentação em /docs.' },
      { id: 'tkinter', nome: 'App de janela', lado: 'Desktop', descricao: 'Programa de computador com janela, usando Tkinter.' },
      { id: 'python', nome: 'Script', lado: 'Terminal', descricao: 'Programa simples em Python, com ambiente virtual (.venv).' }
    ]
  },
  {
    id: 'java', nome: 'Java', ts: false, apelidos: 'jdk maven jvm spring',
    modelos: [
      { id: 'java-maven', nome: 'Projeto Maven', lado: 'Terminal', descricao: 'Estrutura padrão do Maven, com testes. Precisa do Maven e do JDK.' },
      { id: 'java', nome: 'Console', lado: 'Terminal', descricao: 'Main.java simples. Compila com javac (JDK).' }
    ]
  },
  {
    id: 'csharp', nome: 'C#', ts: false, apelidos: 'csharp c sharp dotnet .net',
    modelos: [
      { id: 'csharp-api', nome: 'API web', lado: 'Backend', descricao: 'API com ASP.NET Core. Precisa do SDK do .NET.' },
      { id: 'csharp-winforms', nome: 'App de janela', lado: 'Desktop', descricao: 'Programa de Windows com WinForms. Precisa do SDK do .NET.' },
      { id: 'csharp', nome: 'Console', lado: 'Terminal', descricao: 'Programa de terminal em C#. Precisa do SDK do .NET.' }
    ]
  },
  {
    id: 'cpp', nome: 'C++', ts: false, apelidos: 'cpp cmake',
    modelos: [
      { id: 'cpp', nome: 'Console', lado: 'Terminal', descricao: 'main.cpp com CMake. Compila com g++ ou Visual Studio.' }
    ]
  },
  {
    id: 'c', nome: 'C', ts: false, apelidos: 'gcc cmake',
    modelos: [
      { id: 'c', nome: 'Console', lado: 'Terminal', descricao: 'main.c com CMake. Compila com gcc.' }
    ]
  },
  {
    id: 'go', nome: 'Go', ts: false, apelidos: 'golang',
    modelos: [
      { id: 'go-api', nome: 'API web', lado: 'Backend', descricao: 'Servidor HTTP só com a biblioteca padrão. Precisa do Go.' },
      { id: 'go', nome: 'Console', lado: 'Terminal', descricao: 'Programa de terminal com go mod. Precisa do Go.' }
    ]
  },
  {
    id: 'rust', nome: 'Rust', ts: false, apelidos: 'cargo',
    modelos: [
      { id: 'rust', nome: 'Programa', lado: 'Terminal', descricao: 'cargo new: programa de terminal. Precisa do Rust (rustup).' },
      { id: 'rust-lib', nome: 'Biblioteca', lado: 'Biblioteca', descricao: 'cargo new --lib: uma crate para usar em outros projetos.' }
    ]
  },
  {
    id: 'kotlin', nome: 'Kotlin', ts: false, apelidos: 'kt jvm',
    modelos: [
      { id: 'kotlin', nome: 'Console', lado: 'Terminal', descricao: 'Main.kt simples. Compila com kotlinc.' }
    ]
  },
  {
    id: 'php', nome: 'PHP', ts: false, apelidos: 'laravel composer',
    modelos: [
      { id: 'laravel', nome: 'Laravel', lado: 'Full-stack', descricao: 'Framework web completo. Precisa do PHP e do Composer.' },
      { id: 'php', nome: 'Site simples', lado: 'Full-stack', descricao: 'public/index.php. Roda com php -S.' }
    ]
  },
  {
    id: 'ruby', nome: 'Ruby', ts: false, apelidos: 'rails gem',
    modelos: [
      { id: 'rails', nome: 'Ruby on Rails', lado: 'Full-stack', descricao: 'Framework web completo. Precisa do Ruby e do Rails.' },
      { id: 'ruby', nome: 'Script', lado: 'Terminal', descricao: 'main.rb simples, com Gemfile.' }
    ]
  },
  {
    id: 'dart', nome: 'Dart', ts: false, apelidos: 'flutter',
    modelos: [
      { id: 'flutter', nome: 'Flutter', lado: 'Mobile', descricao: 'App de celular, web e computador. Precisa do Flutter SDK.' }
    ]
  }
]

/** O grupo de um modelo — é dele que sai se a tela pergunta TS ou JS. */
export function grupoDe(modelo: ModeloProjeto): Grupo {
  return GRUPOS.find(g => g.modelos.some(m => m.id === modelo)) ?? GRUPOS[0]
}

const semAcento = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * As linguagens que casam com o que foi digitado.
 *
 * Pedido do dono: só o que COMEÇA com o que foi digitado. Antes era "contém",
 * e um "c" trazia JavaScript, Python e Java junto com C.
 *
 * Primeiro vale o nome da linguagem, com o nome exato na frente ("c" põe C
 * antes de C# e C++). Só quando nenhum nome começa assim a busca olha os
 * apelidos e as aplicações, também pelo começo de cada palavra — é assim que
 * "flutter" acha Dart e "api" acha as linguagens que têm API. Sem acento e
 * sem caixa. Vazio devolve todas.
 */
export function filtrarGrupos(texto: string): Grupo[] {
  const t = semAcento(texto.trim())
  if (!t) return GRUPOS

  const porNome = GRUPOS.filter(g => semAcento(g.nome).startsWith(t))
  if (porNome.length > 0) {
    const exato = (g: Grupo): number => (semAcento(g.nome) === t ? 0 : 1)
    return [...porNome].sort((a, b) => exato(a) - exato(b))
  }

  return GRUPOS.filter(g =>
    semAcento([g.apelidos, ...g.modelos.map(m => m.nome)].join(' '))
      .split(/[\s·/+.-]+/)
      .some(palavra => palavra.startsWith(t))
  )
}

/** O mesmo formato que o processo principal confere — ver `main/dev/novoProjeto.ts`. */
export const NOME_VALIDO = /^[a-z][a-z0-9_-]{0,59}$/

/**
 * O que a pessoa digita vira um nome aceitável enquanto digita: minúsculas,
 * sem acento, espaço vira hífen, e o resto some. Melhor do que deixar digitar
 * "Meu App" e recusar no botão.
 */
export function normalizarNome(bruto: string): string {
  return bruto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 60)
}

/** O que vai acontecer, para a pessoa ver antes de apertar. */
export function comandoDe(modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string): string {
  const ts = linguagem === 'ts'
  const venv = 'python -m venv .venv'
  const pip = 'pip install -r requirements.txt'
  switch (modelo) {
    case 'expo':
      return `npx create-expo-app@latest ${nome} --template ${ts ? 'blank-typescript' : 'blank'}`
    case 'vue':
    case 'svelte':
      return `npx create-vite@latest ${nome} --template ${ts ? `${modelo}-ts` : modelo}\nnpm install`
    case 'electron':
      return `npx create-electron-app@latest ${nome} --template=${ts ? 'vite-typescript' : 'vite'}`
    case 'next':
      return `npx create-next-app@latest ${nome} ${ts ? '--ts' : '--js'} --eslint --app`
    case 'node-api':
      return ts
        ? 'cria package.json, src/index.ts com Express e tsconfig.json\nnpm install express\nnpm install --save-dev typescript tsx @types/express @types/node'
        : 'cria package.json e src/index.js com Express\nnpm install express'
    case 'python':
      return `cria main.py, requirements.txt, README e .gitignore\n${venv}`
    case 'tkinter':
      return `cria main.py com uma janela Tkinter\n${venv}`
    case 'fastapi':
      return `cria main.py com FastAPI e requirements.txt\n${venv}\n${pip}`
    case 'flask':
      return `cria app.py com Flask e requirements.txt\n${venv}\n${pip}`
    case 'java':
      return 'cria src/Main.java, README e .gitignore'
    case 'java-maven':
      return `mvn archetype:generate -DartifactId=${nome} -DarchetypeArtifactId=maven-archetype-quickstart`
    case 'csharp':
      return `dotnet new console --name ${nome}`
    case 'csharp-api':
      return `dotnet new webapi --name ${nome}`
    case 'csharp-winforms':
      return `dotnet new winforms --name ${nome}`
    case 'cpp':
      return 'cria main.cpp, CMakeLists.txt, README e .gitignore'
    case 'c':
      return 'cria main.c, CMakeLists.txt, README e .gitignore'
    case 'go':
      return `cria main.go\ngo mod init ${nome}`
    case 'go-api':
      return `cria main.go com um servidor HTTP\ngo mod init ${nome}`
    case 'rust':
      return `cargo new ${nome}`
    case 'rust-lib':
      return `cargo new --lib ${nome}`
    case 'kotlin':
      return 'cria src/Main.kt, README e .gitignore'
    case 'php':
      return 'cria public/index.php, README e .gitignore'
    case 'laravel':
      return `composer create-project laravel/laravel ${nome}`
    case 'ruby':
      return 'cria main.rb, Gemfile, README e .gitignore'
    case 'rails':
      return `rails new ${nome}`
    case 'flutter':
      return `flutter create --project-name ${nome.replace(/-/g, '_')} ${nome}`
    case 'vite':
    default:
      return `npx create-vite@latest ${nome} --template ${ts ? 'react-ts' : 'react'}\nnpm install`
  }
}

/**
 * Criar um projeto novo: linguagem, aplicação, nome — e o Cortex roda o resto.
 *
 * `aoCriar` devolve se deu certo; só aí a janela fecha. Com erro (nome que já
 * existe, por exemplo), ela fica aberta com o que foi escolhido.
 */
export function NovoProjeto({ aoCriar, aoFechar }: {
  aoCriar: (modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string) => Promise<boolean>
  aoFechar: () => void
}) {
  const [modelo, setModelo] = useState<ModeloProjeto>('vite')
  const [linguagem, setLinguagem] = useState<LinguagemProjeto>('ts')
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  /** A lista de linguagens está aberta, e o que foi digitado nela. */
  const [cascata, setCascata] = useState(false)
  const [busca, setBusca] = useState('')
  const [destaque, setDestaque] = useState(0)
  const valido = NOME_VALIDO.test(nome)
  const grupo = grupoDe(modelo)
  const achados = filtrarGrupos(busca)

  useEffect(() => {
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [aoFechar])

  const escolher = (g: Grupo): void => {
    // Trocar de linguagem já escolhe a primeira aplicação dela: nenhum cartão
    // fica aceso de um grupo que saiu da tela.
    if (g.id !== grupo.id) setModelo(g.modelos[0].id)
    setCascata(false)
    setBusca('')
  }

  const criar = async (): Promise<void> => {
    if (!valido || enviando) return
    setEnviando(true)
    try {
      if (await aoCriar(modelo, linguagem, nome)) aoFechar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div
        className="novo-projeto"
        role="dialog"
        aria-label="Novo projeto"
        onClick={e => e.stopPropagation()}
      >
        <div className="novo-projeto-topo">
          <strong>Novo projeto</strong>
          <button className="btn-icone" title="Fechar" onClick={aoFechar}>×</button>
        </div>

        <span className="form-rotulo">Criar aplicação em</span>
        <div className="novo-projeto-cascata">
          <input
            role="combobox"
            aria-expanded={cascata}
            aria-controls="novo-projeto-linguagens"
            // Fechada, mostra a linguagem escolhida; aberta, o que se digita.
            value={cascata ? busca : grupo.nome}
            placeholder="Digite: Java, Go, Flutter, API…"
            onFocus={() => { setCascata(true); setDestaque(0) }}
            onClick={() => setCascata(true)}
            onBlur={() => { setCascata(false); setBusca('') }}
            onChange={e => { setBusca(e.target.value); setCascata(true); setDestaque(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault(); setCascata(true)
                setDestaque(d => Math.min(d + 1, achados.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault(); setDestaque(d => Math.max(d - 1, 0))
              } else if (e.key === 'Enter' && cascata) {
                e.preventDefault()
                const g = achados[destaque]
                if (g) escolher(g)
              } else if (e.key === 'Escape' && cascata) {
                // Fecha a lista, e não a janela inteira.
                e.stopPropagation(); setCascata(false); setBusca('')
              }
            }}
          />
          <span className="novo-projeto-cascata-seta" aria-hidden="true">▾</span>
          {cascata && (
            <div className="novo-projeto-cascata-lista" id="novo-projeto-linguagens" role="listbox">
              {achados.length === 0 && <div className="novo-projeto-cascata-vazio">Nenhuma linguagem com esse nome.</div>}
              {achados.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  role="option"
                  aria-selected={i === destaque}
                  className={`novo-projeto-cascata-item ${g.id === grupo.id ? 'escolhido' : ''}`}
                  // `mouseDown` + preventDefault: o clique chega antes de o
                  // campo perder o foco e fechar a lista.
                  onMouseDown={e => { e.preventDefault(); escolher(g) }}
                  onMouseEnter={() => setDestaque(i)}
                >
                  <strong>{g.nome}</strong>
                  <span>{g.modelos.map(m => m.nome).join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="form-rotulo">Tipo de aplicação</span>
        <div className="novo-projeto-modelos">
          {grupo.modelos.map(m => (
            <button
              key={m.id}
              type="button"
              className="novo-projeto-modelo"
              aria-pressed={modelo === m.id}
              onClick={() => setModelo(m.id)}
            >
              <span className="novo-projeto-modelo-topo">
                <strong>{m.nome}</strong>
                <em className="novo-projeto-lado">{m.lado}</em>
              </span>
              <span>{m.descricao}</span>
            </button>
          ))}
        </div>

        {grupo.ts && (
          <>
            <span className="form-rotulo">Linguagem</span>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={linguagem === 'ts'}
                onClick={() => setLinguagem('ts')}>
                TypeScript (.tsx)
              </button>
              <button type="button" className="chip" aria-pressed={linguagem === 'js'}
                onClick={() => setLinguagem('js')}>
                JavaScript (.jsx)
              </button>
            </div>
          </>
        )}

        <label className="novo-projeto-campo">
          <span className="form-rotulo">Nome do projeto</span>
          <input
            value={nome}
            placeholder="meu-app"
            onChange={e => setNome(normalizarNome(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') void criar() }}
          />
        </label>
        <p className="form-dica">
          Vai para <code>Área de Trabalho\projetos\{nome || 'meu-app'}</code>. A pasta
          projetos é criada se ainda não existir, e a instalação aparece no terminal.
        </p>
        <pre className="novo-projeto-comando">{comandoDe(modelo, linguagem, nome || 'meu-app')}</pre>

        <div className="novo-projeto-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className="btn" disabled={!valido || enviando} onClick={() => void criar()}>
            {enviando ? 'Começando…' : 'Criar e instalar'}
          </button>
        </div>
      </div>
    </div>
  )
}
