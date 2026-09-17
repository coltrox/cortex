import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  nomeDeProjetoValido, etapasNovoProjeto, arquivosNovoProjeto, MODELOS_PROJETO
} from './novoProjeto'

const BASE = join('C:', 'Users', 'x', 'Desktop', 'projetos')

describe('nome do projeto novo', () => {
  it('aceita o que o npm aceita como nome simples', () => {
    for (const n of ['meu-app', 'app2', 'loja_online', 'a']) expect(nomeDeProjetoValido(n)).toBe(true)
  })

  it('recusa o que o shell leria como outra coisa', () => {
    // O nome vai para um `npx` que no Windows passa pelo cmd.exe.
    for (const n of ['meu app', 'a&calc', 'a|b', '../fora', 'C:\\x', '"a"', 'a;b', '%PATH%']) {
      expect(nomeDeProjetoValido(n)).toBe(false)
    }
  })

  it('recusa maiuscula, comeco por numero, vazio e comprido demais', () => {
    for (const n of ['MeuApp', '1app', '', 'a'.repeat(61), 42, null]) {
      expect(nomeDeProjetoValido(n)).toBe(false)
    }
  })
})

describe('comandos do projeto novo', () => {
  it('Expo com TypeScript usa o modelo blank-typescript, na pasta projetos', () => {
    expect(etapasNovoProjeto('expo', 'ts', 'meu-app', BASE)).toEqual([{
      comando: 'npx',
      args: ['--yes', 'create-expo-app@latest', 'meu-app', '--template', 'blank-typescript'],
      cwd: BASE,
      env: { CI: '1' }
    }])
  })

  it('Expo com JavaScript usa o modelo blank', () => {
    expect(etapasNovoProjeto('expo', 'js', 'meu-app', BASE)[0].args).toContain('blank')
  })

  it('Vite cria os arquivos e depois instala DENTRO da pasta do projeto', () => {
    const e = etapasNovoProjeto('vite', 'js', 'site', BASE)
    expect(e.map(x => [x.comando, ...x.args])).toEqual([
      ['npx', '--yes', 'create-vite@latest', 'site', '--template', 'react'],
      ['npm', 'install']
    ])
    expect(e[0].cwd).toBe(BASE)
    expect(e[1].cwd).toBe(join(BASE, 'site'))
  })

  it('Vite com TypeScript usa react-ts', () => {
    expect(etapasNovoProjeto('vite', 'ts', 'site', BASE)[0].args).toContain('react-ts')
  })

  it('nome invalido nao vira comando nenhum', () => {
    expect(() => etapasNovoProjeto('vite', 'ts', 'a & del', BASE)).toThrow()
    expect(() => arquivosNovoProjeto('python', '../fora')).toThrow()
  })

  it('Electron usa o Electron Forge com Vite, em TS ou JS', () => {
    const [ts] = etapasNovoProjeto('electron', 'ts', 'app', BASE)
    expect([ts.comando, ...ts.args]).toEqual(['npx', '--yes', 'create-electron-app@latest', 'app', '--template=vite-typescript'])
    expect(ts.cwd).toBe(BASE)
    expect(etapasNovoProjeto('electron', 'js', 'app', BASE)[0].args).toContain('--template=vite')
  })

  it('Next.js nao passa aspas nem asterisco pelo shell', () => {
    const [e] = etapasNovoProjeto('next', 'js', 'site', BASE)
    expect(e.args).toContain('--js')
    for (const a of e.args) expect(a).not.toMatch(/["*&|<>]/)
  })

  it('Python escreve os arquivos e cria o .venv dentro da pasta do projeto', () => {
    expect(arquivosNovoProjeto('python', 'calc').map(a => a.caminho))
      .toEqual(['main.py', 'requirements.txt', '.gitignore', 'README.md'])
    const [venv] = etapasNovoProjeto('python', 'ts', 'calc', BASE)
    expect([venv.comando, ...venv.args]).toEqual(['python', '-m', 'venv', '.venv'])
    expect(venv.cwd).toBe(join(BASE, 'calc'))
  })

  it('FastAPI e Flask instalam as dependencias com o Python do .venv', () => {
    for (const m of ['fastapi', 'flask'] as const) {
      const e = etapasNovoProjeto(m, 'ts', 'api', BASE)
      expect(e).toHaveLength(2)
      expect(e[1].comando).toContain('.venv')
      expect(e[1].args).toEqual(['-m', 'pip', 'install', '-r', 'requirements.txt'])
    }
    expect(arquivosNovoProjeto('fastapi', 'api').find(a => a.caminho === 'requirements.txt')?.conteudo)
      .toContain('fastapi')
  })

  it('C# usa o modelo certo do dotnet new', () => {
    const args = (m: 'csharp' | 'csharp-api' | 'csharp-winforms'): string[] =>
      etapasNovoProjeto(m, 'ts', 'app', BASE)[0].args
    expect(args('csharp')).toEqual(['new', 'console', '--name', 'app', '--output', 'app'])
    expect(args('csharp-api')[1]).toBe('webapi')
    expect(args('csharp-winforms')[1]).toBe('winforms')
    expect(arquivosNovoProjeto('csharp', 'app')).toEqual([])
  })

  it('C e C++ sao so arquivos, sem comando nenhum', () => {
    expect(etapasNovoProjeto('cpp', 'ts', 'jogo', BASE)).toEqual([])
    expect(arquivosNovoProjeto('cpp', 'jogo').map(a => a.caminho)).toContain('main.cpp')
    expect(arquivosNovoProjeto('c', 'jogo').map(a => a.caminho)).toContain('main.c')
  })

  it('API Node escreve o servidor e instala o Express pelo npm, em TS ou JS', () => {
    const ts = arquivosNovoProjeto('node-api', 'api', 'ts').map(a => a.caminho)
    expect(ts).toEqual(expect.arrayContaining(['package.json', 'src/index.ts', 'tsconfig.json']))
    const js = arquivosNovoProjeto('node-api', 'api', 'js').map(a => a.caminho)
    expect(js).toContain('src/index.js')
    expect(js).not.toContain('tsconfig.json')

    const pacote = JSON.parse(arquivosNovoProjeto('node-api', 'api', 'js')[0].conteudo) as Record<string, unknown>
    expect(pacote.name).toBe('api')
    // As versoes quem escreve e o npm install, com as de hoje.
    expect(pacote).not.toHaveProperty('dependencies')

    expect(etapasNovoProjeto('node-api', 'js', 'api', BASE).map(e => e.args))
      .toEqual([['install', 'express']])
    const eTs = etapasNovoProjeto('node-api', 'ts', 'api', BASE)
    expect(eTs).toHaveLength(2)
    expect(eTs[1].args).toContain('typescript')
    expect(eTs[0].cwd).toBe(join(BASE, 'api'))
  })

  it('Vue e Svelte usam os modelos do create-vite, e instalam', () => {
    expect(etapasNovoProjeto('vue', 'ts', 'site', BASE)[0].args).toContain('vue-ts')
    expect(etapasNovoProjeto('svelte', 'js', 'site', BASE)[0].args).toContain('svelte')
    expect(etapasNovoProjeto('svelte', 'js', 'site', BASE)[1].args).toEqual(['install'])
  })

  it('Java: console so com arquivos, Maven pelo quickstart oficial', () => {
    expect(arquivosNovoProjeto('java', 'app').map(a => a.caminho)).toContain('src/Main.java')
    expect(etapasNovoProjeto('java', 'ts', 'app', BASE)).toEqual([])
    const [mvn] = etapasNovoProjeto('java-maven', 'ts', 'app', BASE)
    expect(mvn.comando).toBe('mvn')
    expect(mvn.args).toContain('-DartifactId=app')
    expect(mvn.args).toContain('-DinteractiveMode=false')
  })

  it('Go escreve main.go e cria o modulo dentro da pasta', () => {
    for (const m of ['go', 'go-api'] as const) {
      expect(arquivosNovoProjeto(m, 'api').map(a => a.caminho)).toContain('main.go')
      const [e] = etapasNovoProjeto(m, 'ts', 'api', BASE)
      expect([e.comando, ...e.args]).toEqual(['go', 'mod', 'init', 'api'])
      expect(e.cwd).toBe(join(BASE, 'api'))
    }
  })

  it('Rust usa cargo new, com --lib na biblioteca', () => {
    expect(etapasNovoProjeto('rust', 'ts', 'jogo', BASE)[0].args).toEqual(['new', 'jogo'])
    expect(etapasNovoProjeto('rust-lib', 'ts', 'jogo', BASE)[0].args).toEqual(['new', '--lib', 'jogo'])
  })

  it('Laravel, Rails e Flutter usam o criador de cada um', () => {
    expect(etapasNovoProjeto('laravel', 'ts', 'loja', BASE)[0].args).toEqual(['create-project', 'laravel/laravel', 'loja'])
    expect(etapasNovoProjeto('rails', 'ts', 'loja', BASE)[0].args).toEqual(['new', 'loja'])
    // O pacote Dart nao aceita hifen; a pasta aceita.
    expect(etapasNovoProjeto('flutter', 'ts', 'meu-app', BASE)[0].args)
      .toEqual(['create', '--project-name', 'meu_app', 'meu-app'])
  })

  it('Kotlin, PHP e Ruby simples sao so arquivos', () => {
    for (const m of ['kotlin', 'php', 'ruby'] as const) {
      expect(arquivosNovoProjeto(m, 'app').length).toBeGreaterThan(0)
      expect(etapasNovoProjeto(m, 'ts', 'app', BASE)).toEqual([])
    }
  })

  it('nenhum argumento de comando leva caractere que o cmd.exe interpreta', () => {
    for (const m of MODELOS_PROJETO) {
      for (const e of etapasNovoProjeto(m, 'ts', 'app', BASE)) {
        for (const a of e.args) expect(a).not.toMatch(/["*&|<>^%]/)
      }
    }
  })

  it('nenhum arquivo inicial sai da pasta do projeto', () => {
    for (const m of MODELOS_PROJETO) {
      for (const a of arquivosNovoProjeto(m, 'app')) {
        expect(a.caminho).not.toMatch(/\.\.|^[\\/]|:/)
      }
    }
  })
})

describe('repoDoGithub', () => {
  it('aceita link da página, de clone, SSH e dono/repo', async () => {
    const { repoDoGithub } = await import('./novoProjeto')
    const esperado = { url: 'https://github.com/coltrox/cortex.git', nome: 'cortex' }
    expect(repoDoGithub('https://github.com/coltrox/cortex')).toEqual(esperado)
    expect(repoDoGithub('https://github.com/coltrox/cortex.git')).toEqual(esperado)
    expect(repoDoGithub('github.com/coltrox/cortex/')).toEqual(esperado)
    expect(repoDoGithub('git@github.com:coltrox/cortex.git')).toEqual(esperado)
    expect(repoDoGithub('  coltrox/cortex ')).toEqual(esperado)
  })

  it('recusa o que não é repositório do GitHub', async () => {
    const { repoDoGithub } = await import('./novoProjeto')
    for (const ruim of [
      'https://gitlab.com/a/b', 'file:///C:/x', 'ext::sh -c calc', '--upload-pack=calc/x',
      'a/-b', 'a/..', 'a/b/c', 'https://github.com/a/b?x=1', 'a/b; rm -rf', '', 42
    ]) expect(repoDoGithub(ruim)).toBeNull()
  })
})
