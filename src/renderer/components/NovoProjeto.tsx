import { useEffect, useState } from 'react'
import type { LinguagemProjeto, ModeloProjeto } from '../../shared/types'

/**
 * De que lado a aplicação fica.
 *
 * Etiqueta no cartão, e não um passo a mais para escolher: cada aplicação já é
 * de um lado só, e perguntar "frontend ou backend" antes seria uma decisão que
 * o cartão responde sozinho.
 */
export type Lado = 'Frontend' | 'Backend' | 'Full-stack' | 'Mobile' | 'Desktop' | 'Terminal'

type Modelo = { id: ModeloProjeto; nome: string; lado: Lado; descricao: string }

/**
 * As aplicações, agrupadas pela linguagem.
 *
 * Pedido do dono: primeiro "criar uma aplicação em Python", e só então as
 * opções daquela linguagem — em vez de uma lista única misturando app de
 * celular com API em C#. `ts` diz se o grupo ainda pergunta TypeScript ou
 * JavaScript.
 */
export const GRUPOS: { id: string; nome: string; ts: boolean; modelos: Modelo[] }[] = [
  {
    id: 'js', nome: 'JavaScript / TypeScript', ts: true,
    modelos: [
      { id: 'vite', nome: 'React + Vite', lado: 'Frontend', descricao: 'Site ou app web com React. Abre no navegador.' },
      { id: 'node-api', nome: 'API com Express', lado: 'Backend', descricao: 'Servidor Node com Express, pronto para receber requisições.' },
      { id: 'next', nome: 'Next.js', lado: 'Full-stack', descricao: 'Site com React e servidor junto, pronto para publicar na Vercel.' },
      { id: 'expo', nome: 'Expo', lado: 'Mobile', descricao: 'App de celular com React Native. Abre no Expo Go pelo QR code.' },
      { id: 'electron', nome: 'Electron', lado: 'Desktop', descricao: 'App de computador (Windows, Mac, Linux) com Electron Forge e Vite.' }
    ]
  },
  {
    id: 'python', nome: 'Python', ts: false,
    modelos: [
      { id: 'flask', nome: 'Site com Flask', lado: 'Full-stack', descricao: 'Servidor web leve que já devolve as páginas. Bom para começar.' },
      { id: 'fastapi', nome: 'API com FastAPI', lado: 'Backend', descricao: 'API web moderna, com a documentação em /docs.' },
      { id: 'tkinter', nome: 'App de janela', lado: 'Desktop', descricao: 'Programa de computador com janela, usando Tkinter.' },
      { id: 'python', nome: 'Script', lado: 'Terminal', descricao: 'Programa simples em Python, com ambiente virtual (.venv).' }
    ]
  },
  {
    id: 'csharp', nome: 'C#', ts: false,
    modelos: [
      { id: 'csharp-api', nome: 'API web', lado: 'Backend', descricao: 'API com ASP.NET Core. Precisa do SDK do .NET.' },
      { id: 'csharp-winforms', nome: 'App de janela', lado: 'Desktop', descricao: 'Programa de Windows com WinForms. Precisa do SDK do .NET.' },
      { id: 'csharp', nome: 'Console', lado: 'Terminal', descricao: 'Programa de terminal em C#. Precisa do SDK do .NET.' }
    ]
  },
  {
    id: 'cpp', nome: 'C++', ts: false,
    modelos: [
      { id: 'cpp', nome: 'Console', lado: 'Terminal', descricao: 'main.cpp com CMake. Compila com g++ ou Visual Studio.' }
    ]
  },
  {
    id: 'c', nome: 'C', ts: false,
    modelos: [
      { id: 'c', nome: 'Console', lado: 'Terminal', descricao: 'main.c com CMake. Compila com gcc.' }
    ]
  }
]

/** O grupo de um modelo — é dele que sai se a tela pergunta TS ou JS. */
export function grupoDe(modelo: ModeloProjeto): (typeof GRUPOS)[number] {
  return GRUPOS.find(g => g.modelos.some(m => m.id === modelo)) ?? GRUPOS[0]
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
  const valido = NOME_VALIDO.test(nome)
  const grupo = grupoDe(modelo)

  useEffect(() => {
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [aoFechar])

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
        <div className="chips">
          {GRUPOS.map(g => (
            <button key={g.id} type="button" className="chip" aria-pressed={grupo.id === g.id}
              // Trocar de linguagem já escolhe a primeira aplicação dela:
              // nenhum botão fica aceso de um grupo que saiu da tela.
              onClick={() => { if (grupo.id !== g.id) setModelo(g.modelos[0].id) }}>
              {g.nome}
            </button>
          ))}
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
            autoFocus
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
