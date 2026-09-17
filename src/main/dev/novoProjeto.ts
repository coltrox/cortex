import { join } from 'node:path'
import type { Etapa } from './processos'
import type { ModeloProjeto, LinguagemProjeto } from '../../shared/types'

/**
 * Criar um projeto novo pela lente Dev.
 *
 * A guarda é a mesma dos scripts do `package.json`: a tela escolhe entre
 * opções FECHADAS (modelo, linguagem) e dá um nome — e os comandos e arquivos
 * saem destas tabelas, montados no processo principal. Não existe caminho para
 * a tela mandar um comando.
 *
 * O nome vai como argumento de um `npx` ou `dotnet`, que no Windows passam
 * pelo shell. Por isso o formato é estreito de propósito: letra minúscula no
 * começo, depois letras, números, `-` e `_`. Nada que o cmd.exe leia como
 * operador, aspas ou caminho — e é também o que o npm aceita como nome de
 * pacote.
 */

export const MODELOS_PROJETO: readonly ModeloProjeto[] = [
  'expo', 'vite', 'vue', 'svelte', 'electron', 'next', 'node-api',
  'python', 'fastapi', 'flask', 'tkinter',
  'java', 'java-maven',
  'csharp', 'csharp-api', 'csharp-winforms',
  'cpp', 'c',
  'go', 'go-api',
  'rust', 'rust-lib',
  'kotlin',
  'php', 'laravel',
  'ruby', 'rails',
  'flutter'
]
export const LINGUAGENS_PROJETO: readonly LinguagemProjeto[] = ['ts', 'js']

export function nomeDeProjetoValido(nome: unknown): nome is string {
  return typeof nome === 'string' && /^[a-z][a-z0-9_-]{0,59}$/.test(nome)
}

/**
 * Um repositório do GitHub, do jeito que a pessoa colar: o link da página,
 * o link de clone (`.git`), o SSH (`git@github.com:dono/repo.git`) ou só
 * `dono/repo`. Sai sempre como URL https — e com o nome da pasta.
 *
 * Só GitHub e só esse formato estreito: o texto vira argumento do `git`, e
 * uma URL qualquer (`file://`, `ext::`, opção começando com `-`) é exatamente
 * o que não pode chegar lá.
 */
export function repoDoGithub(entrada: unknown): { url: string; nome: string } | null {
  if (typeof entrada !== 'string') return null
  const t = entrada.trim()
  const m =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(t) ??
    /^git@github\.com:([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?$/.exec(t) ??
    /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?$/.exec(t)
  if (!m) return null
  const [, dono, repo] = m
  if (dono.startsWith('-') || repo.startsWith('.') || repo.startsWith('-')) return null
  return { url: `https://github.com/${dono}/${repo}.git`, nome: repo }
}

/**
 * O modelo deixa escolher entre TypeScript e JavaScript?
 *
 * Só os do mundo JavaScript. Em Python, C#, C++ e C a linguagem já é a do
 * modelo, e a escolha que chega junto é ignorada.
 */
export function usaLinguagem(modelo: ModeloProjeto): boolean {
  return modelo === 'expo' || modelo === 'vite' || modelo === 'vue' || modelo === 'svelte' ||
    modelo === 'electron' || modelo === 'next' || modelo === 'node-api'
}

/** O nome que aparece no painel de processos: "criar Electron · meu-app". */
export const NOME_MODELO: Record<ModeloProjeto, string> = {
  expo: 'Expo', vite: 'React + Vite', electron: 'Electron', next: 'Next.js', 'node-api': 'API Node',
  python: 'Python', fastapi: 'FastAPI', flask: 'Flask', tkinter: 'Tkinter',
  csharp: 'C#', 'csharp-api': 'API C#', 'csharp-winforms': 'WinForms',
  cpp: 'C++', c: 'C',
  vue: 'Vue', svelte: 'Svelte',
  java: 'Java', 'java-maven': 'Maven',
  go: 'Go', 'go-api': 'API Go',
  rust: 'Rust', 'rust-lib': 'Biblioteca Rust',
  kotlin: 'Kotlin',
  php: 'PHP', laravel: 'Laravel',
  ruby: 'Ruby', rails: 'Rails',
  flutter: 'Flutter'
}

/** Um arquivo que o próprio Cortex escreve na pasta do projeto novo. */
export type ArquivoInicial = { caminho: string; conteudo: string }

const bloco = (linhas: string[]): string => '```\n' + linhas.join('\n') + '\n```\n'

const README_PYTHON = (nome: string, rodar: string): string =>
  `# ${nome}\n\n## Rodar\n\n` +
  bloco(['.venv\\Scripts\\activate', 'pip install -r requirements.txt', rodar])

const GITIGNORE_PYTHON = '.venv/\n__pycache__/\n*.pyc\n.env\n'

/**
 * Os arquivos iniciais de quem não tem criador oficial.
 *
 * Python, C e C++ não têm um `create-*` que todo mundo usa, então o Cortex
 * escreve o esqueleto ele mesmo — conteúdo FIXO, desta tabela, com o nome já
 * conferido. Os caminhos são relativos à pasta do projeto e nunca sobem dela.
 * Nos outros modelos o criador oficial monta tudo, e a lista é vazia.
 */
export function arquivosNovoProjeto(
  modelo: ModeloProjeto, nome: string, linguagem: LinguagemProjeto = 'ts'
): ArquivoInicial[] {
  if (!nomeDeProjetoValido(nome)) {
    throw new Error('nome inválido: comece com letra minúscula e use só letras, números, - e _')
  }

  switch (modelo) {
    case 'java':
      return [
        {
          caminho: 'src/Main.java',
          conteudo: 'public class Main {\n    public static void main(String[] args) {\n' +
            `        System.out.println("Olá, ${nome}!");\n    }\n}\n`
        },
        { caminho: '.gitignore', conteudo: '*.class\nout/\n' },
        {
          caminho: 'README.md',
          conteudo: `# ${nome}\n\n## Compilar e rodar\n\n` + bloco(['javac -d out src/Main.java', 'java -cp out Main'])
        }
      ]

    case 'kotlin':
      return [
        { caminho: 'src/Main.kt', conteudo: `fun main() {\n    println("Olá, ${nome}!")\n}\n` },
        { caminho: '.gitignore', conteudo: '*.jar\nout/\n' },
        {
          caminho: 'README.md',
          conteudo: `# ${nome}\n\n## Compilar e rodar\n\n` +
            bloco(['kotlinc src/Main.kt -include-runtime -d app.jar', 'java -jar app.jar'])
        }
      ]

    case 'go':
      return [
        { caminho: 'main.go', conteudo: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Olá, ${nome}!")\n}\n` },
        { caminho: '.gitignore', conteudo: '/bin/\n*.exe\n' },
        { caminho: 'README.md', conteudo: `# ${nome}\n\n## Rodar\n\n` + bloco(['go run .']) }
      ]

    case 'go-api':
      return [
        {
          caminho: 'main.go',
          conteudo:
            'package main\n\nimport (\n\t"encoding/json"\n\t"log"\n\t"net/http"\n)\n\n' +
            'func main() {\n' +
            '\thttp.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {\n' +
            '\t\tw.Header().Set("Content-Type", "application/json")\n' +
            `\t\tjson.NewEncoder(w).Encode(map[string]string{"mensagem": "Olá, ${nome}!"})\n` +
            '\t})\n\n' +
            '\tlog.Println("API rodando em http://localhost:8080")\n' +
            '\tlog.Fatal(http.ListenAndServe(":8080", nil))\n' +
            '}\n'
        },
        { caminho: '.gitignore', conteudo: '/bin/\n*.exe\n' },
        { caminho: 'README.md', conteudo: `# ${nome}\n\n## Rodar\n\n` + bloco(['go run .']) }
      ]

    case 'php':
      return [
        {
          caminho: 'public/index.php',
          conteudo:
            `<?php $nome = '${nome}'; ?>\n<!doctype html>\n<html lang="pt-BR">\n` +
            '<head><meta charset="utf-8"><title><?= htmlspecialchars($nome) ?></title></head>\n' +
            '<body>\n  <h1>Olá, <?= htmlspecialchars($nome) ?>!</h1>\n</body>\n</html>\n'
        },
        { caminho: '.gitignore', conteudo: 'vendor/\n.env\n' },
        { caminho: 'README.md', conteudo: `# ${nome}\n\n## Rodar\n\n` + bloco(['php -S localhost:8000 -t public']) }
      ]

    case 'ruby':
      return [
        { caminho: 'main.rb', conteudo: `puts "Olá, ${nome}!"\n` },
        { caminho: 'Gemfile', conteudo: 'source "https://rubygems.org"\n' },
        { caminho: '.gitignore', conteudo: '.bundle/\nvendor/\n' },
        { caminho: 'README.md', conteudo: `# ${nome}\n\n## Rodar\n\n` + bloco(['ruby main.rb']) }
      ]

    case 'node-api': {
      // Sem dependências no package.json: quem as escreve é o `npm install`
      // das etapas, com as versões de agora — uma versão fixa aqui envelhece.
      const ts = linguagem === 'ts'
      const pacote = {
        name: nome,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: ts
          ? { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' }
          : { dev: 'node --watch src/index.js', start: 'node src/index.js' }
      }
      const servidor =
        "import express from 'express'\n\n" +
        'const app = express()\n' +
        'app.use(express.json())\n\n' +
        `app.get('/', (_req${ts ? ': express.Request' : ''}, res${ts ? ': express.Response' : ''}) => {\n` +
        `  res.json({ mensagem: 'Olá, ${nome}!' })\n` +
        '})\n\n' +
        'const porta = Number(process.env.PORT ?? 3000)\n' +
        'app.listen(porta, () => {\n' +
        '  console.log(`API rodando em http://localhost:${porta}`)\n' +
        '})\n'
      return [
        { caminho: 'package.json', conteudo: JSON.stringify(pacote, null, 2) + '\n' },
        { caminho: ts ? 'src/index.ts' : 'src/index.js', conteudo: servidor },
        ...(ts ? [{
          caminho: 'tsconfig.json',
          conteudo: JSON.stringify({
            compilerOptions: {
              target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
              outDir: 'dist', rootDir: 'src', strict: true, esModuleInterop: true, skipLibCheck: true
            },
            include: ['src']
          }, null, 2) + '\n'
        }] : []),
        { caminho: '.gitignore', conteudo: 'node_modules/\ndist/\n.env\n' },
        { caminho: 'README.md', conteudo: `# ${nome}\n\n## Rodar\n\n` + bloco(['npm run dev']) }
      ]
    }

    case 'python':
      return [
        {
          caminho: 'main.py',
          conteudo: `def main() -> None:\n    print("Olá, ${nome}!")\n\n\nif __name__ == "__main__":\n    main()\n`
        },
        { caminho: 'requirements.txt', conteudo: '# Uma dependência por linha.\n' },
        { caminho: '.gitignore', conteudo: GITIGNORE_PYTHON },
        { caminho: 'README.md', conteudo: README_PYTHON(nome, 'python main.py') }
      ]

    case 'fastapi':
      return [
        {
          caminho: 'main.py',
          conteudo:
            'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n' +
            '@app.get("/")\ndef inicio() -> dict[str, str]:\n' +
            `    return {"mensagem": "Olá, ${nome}!"}\n`
        },
        { caminho: 'requirements.txt', conteudo: 'fastapi\nuvicorn[standard]\n' },
        { caminho: '.gitignore', conteudo: GITIGNORE_PYTHON },
        {
          caminho: 'README.md',
          conteudo: README_PYTHON(nome, 'uvicorn main:app --reload') +
            '\nA documentação interativa fica em http://localhost:8000/docs\n'
        }
      ]

    case 'flask':
      return [
        {
          caminho: 'app.py',
          conteudo:
            'from flask import Flask\n\napp = Flask(__name__)\n\n\n' +
            '@app.route("/")\ndef inicio() -> str:\n' +
            `    return "<h1>Olá, ${nome}!</h1>"\n\n\n` +
            'if __name__ == "__main__":\n    app.run(debug=True)\n'
        },
        { caminho: 'requirements.txt', conteudo: 'flask\n' },
        { caminho: '.gitignore', conteudo: GITIGNORE_PYTHON },
        { caminho: 'README.md', conteudo: README_PYTHON(nome, 'python app.py') }
      ]

    case 'tkinter':
      return [
        {
          caminho: 'main.py',
          conteudo:
            'import tkinter as tk\n\n\ndef main() -> None:\n' +
            '    janela = tk.Tk()\n' +
            `    janela.title("${nome}")\n` +
            '    janela.geometry("420x240")\n' +
            `    tk.Label(janela, text="Olá, ${nome}!", font=("Segoe UI", 16)).pack(expand=True)\n` +
            '    janela.mainloop()\n\n\n' +
            'if __name__ == "__main__":\n    main()\n'
        },
        { caminho: 'requirements.txt', conteudo: '# O Tkinter já vem com o Python.\n' },
        { caminho: '.gitignore', conteudo: GITIGNORE_PYTHON },
        { caminho: 'README.md', conteudo: README_PYTHON(nome, 'python main.py') }
      ]

    case 'c':
    case 'cpp': {
      const cpp = modelo === 'cpp'
      const fonte = cpp ? 'main.cpp' : 'main.c'
      return [
        {
          caminho: fonte,
          conteudo: cpp
            ? `#include <iostream>\n\nint main() {\n    std::cout << "Olá, ${nome}!" << std::endl;\n    return 0;\n}\n`
            : `#include <stdio.h>\n\nint main(void) {\n    printf("Olá, ${nome}!\\n");\n    return 0;\n}\n`
        },
        {
          caminho: 'CMakeLists.txt',
          conteudo: cpp
            ? `cmake_minimum_required(VERSION 3.16)\nproject(${nome} CXX)\n\nset(CMAKE_CXX_STANDARD 17)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_executable(${nome} ${fonte})\n`
            : `cmake_minimum_required(VERSION 3.16)\nproject(${nome} C)\n\nset(CMAKE_C_STANDARD 17)\n\nadd_executable(${nome} ${fonte})\n`
        },
        { caminho: '.gitignore', conteudo: 'build/\n*.exe\n*.o\n*.obj\n' },
        {
          caminho: 'README.md',
          conteudo: `# ${nome}\n\n## Compilar e rodar\n\n` +
            bloco([`${cpp ? 'g++ -std=c++17' : 'gcc'} ${fonte} -o ${nome}`, `.\\${nome}`]) +
            '\nOu com CMake:\n\n' +
            bloco(['cmake -S . -B build', 'cmake --build build'])
        }
      ]
    }

    default:
      return []
  }
}

/**
 * Os comandos que criam o projeto, na ordem.
 *
 * `base` é a pasta `projetos` da Área de Trabalho, resolvida pelo processo
 * principal — nunca vem da tela.
 */
export function etapasNovoProjeto(
  modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string, base: string
): Etapa[] {
  if (!nomeDeProjetoValido(nome)) {
    throw new Error('nome inválido: comece com letra minúscula e use só letras, números, - e _')
  }
  const ts = linguagem === 'ts'
  // Sem terminal de verdade do outro lado, um criador que parasse para
  // perguntar alguma coisa ficaria esperando para sempre. `CI=1` é o jeito que
  // os criadores entendem de "não pergunte, use o padrão".
  const semPerguntas = { CI: '1' }
  const pasta = join(base, nome)

  // O Python do ambiente virtual, relativo à pasta do projeto: instalar com
  // ele põe as bibliotecas dentro de `.venv`, e não no Python do computador.
  const pythonDoVenv = process.platform === 'win32'
    ? join('.venv', 'Scripts', 'python')
    : join('.venv', 'bin', 'python')
  const criarVenv: Etapa = { comando: 'python', args: ['-m', 'venv', '.venv'], cwd: pasta, env: semPerguntas }
  const instalarRequisitos: Etapa = {
    comando: pythonDoVenv, args: ['-m', 'pip', 'install', '-r', 'requirements.txt'], cwd: pasta, env: semPerguntas
  }

  const dotnet = (modeloDotnet: string): Etapa[] => [{
    comando: 'dotnet',
    args: ['new', modeloDotnet, '--name', nome, '--output', nome],
    cwd: base,
    env: { ...semPerguntas, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }
  }]

  switch (modelo) {
    case 'expo':
      // O create-expo-app já instala as dependências no fim.
      return [{
        comando: 'npx',
        args: ['--yes', 'create-expo-app@latest', nome, '--template', ts ? 'blank-typescript' : 'blank'],
        cwd: base,
        env: semPerguntas
      }]

    case 'electron':
      // Electron Forge com Vite: o modelo oficial do Electron. Também instala
      // as dependências sozinho.
      return [{
        comando: 'npx',
        args: ['--yes', 'create-electron-app@latest', nome, `--template=${ts ? 'vite-typescript' : 'vite'}`],
        cwd: base,
        env: semPerguntas
      }]

    case 'next':
      // Sem `--import-alias "@/*"`: aspas e asterisco passariam pelo cmd.exe.
      // O `--yes` do fim aceita o padrão de tudo que não foi dito.
      return [{
        comando: 'npx',
        args: ['--yes', 'create-next-app@latest', nome, ts ? '--ts' : '--js', '--eslint', '--app', '--use-npm', '--yes'],
        cwd: base,
        env: semPerguntas
      }]

    case 'vue':
    case 'svelte':
      // Os modelos oficiais do create-vite, como o React.
      return [
        {
          comando: 'npx',
          args: ['--yes', 'create-vite@latest', nome, '--template', ts ? `${modelo}-ts` : modelo],
          cwd: base,
          env: semPerguntas
        },
        { comando: 'npm', args: ['install'], cwd: pasta, env: semPerguntas }
      ]

    case 'java':
    case 'kotlin':
    case 'php':
    case 'ruby':
      // Só arquivos: compilar ou rodar depende do que a pessoa tem instalado.
      return []

    case 'java-maven':
      // O quickstart oficial do Maven. Precisa do Maven (`mvn`) e do JDK.
      return [{
        comando: 'mvn',
        args: [
          '-B', 'archetype:generate', '-DgroupId=com.exemplo', `-DartifactId=${nome}`,
          '-DarchetypeArtifactId=maven-archetype-quickstart', '-DarchetypeVersion=1.5',
          '-DinteractiveMode=false'
        ],
        cwd: base,
        env: semPerguntas
      }]

    case 'go':
    case 'go-api':
      // Os arquivos já foram escritos; o módulo é o que o `go run` precisa.
      return [{ comando: 'go', args: ['mod', 'init', nome], cwd: pasta, env: semPerguntas }]

    case 'rust':
    case 'rust-lib':
      return [{
        comando: 'cargo',
        args: modelo === 'rust-lib' ? ['new', '--lib', nome] : ['new', nome],
        cwd: base,
        env: semPerguntas
      }]

    case 'laravel':
      return [{ comando: 'composer', args: ['create-project', 'laravel/laravel', nome], cwd: base, env: semPerguntas }]

    case 'rails':
      return [{ comando: 'rails', args: ['new', nome], cwd: base, env: semPerguntas }]

    case 'flutter':
      // O pacote Dart não aceita hífen no nome; a pasta aceita. Por isso o
      // nome do pacote vai à parte, com `_` no lugar de `-`.
      return [{
        comando: 'flutter',
        args: ['create', '--project-name', nome.replace(/-/g, '_'), nome],
        cwd: base,
        env: semPerguntas
      }]

    case 'node-api':
      // Os arquivos já foram escritos; aqui entram as dependências, com as
      // versões de hoje gravadas pelo próprio npm.
      return [
        { comando: 'npm', args: ['install', 'express'], cwd: pasta, env: semPerguntas },
        ...(ts
          ? [{
            comando: 'npm',
            args: ['install', '--save-dev', 'typescript', 'tsx', '@types/express', '@types/node'],
            cwd: pasta,
            env: semPerguntas
          }]
          : [])
      ]

    case 'python':
    case 'tkinter':
      // Os arquivos já foram escritos; aqui só nasce o ambiente virtual, que
      // é o que separa as bibliotecas deste projeto das do computador.
      return [criarVenv]

    case 'fastapi':
    case 'flask':
      return [criarVenv, instalarRequisitos]

    case 'csharp':
      return dotnet('console')
    case 'csharp-api':
      return dotnet('webapi')
    case 'csharp-winforms':
      return dotnet('winforms')

    case 'c':
    case 'cpp':
      // Só arquivos: compilar depende do compilador que a pessoa tem.
      return []

    case 'vite':
    default:
      return [
        {
          comando: 'npx',
          args: ['--yes', 'create-vite@latest', nome, '--template', ts ? 'react-ts' : 'react'],
          cwd: base,
          env: semPerguntas
        },
        // O create-vite só monta os arquivos; a instalação é um passo à parte.
        { comando: 'npm', args: ['install'], cwd: pasta, env: semPerguntas }
      ]
  }
}
