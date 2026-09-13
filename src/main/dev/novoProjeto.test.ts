import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { nomeDeProjetoValido, etapasNovoProjeto } from './novoProjeto'

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
  })
})
