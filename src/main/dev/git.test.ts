import { describe, it, expect } from 'vitest'
import { urlDeRepositorio, mensagemDeCommit, contarAlterados, contarAFrente } from './git'

describe('a URL do repositorio', () => {
  it('aceita o que o GitHub manda copiar', () => {
    expect(urlDeRepositorio('https://github.com/coltrox/cortex')).toBe('https://github.com/coltrox/cortex')
    expect(urlDeRepositorio('https://github.com/coltrox/cortex.git')).toBe('https://github.com/coltrox/cortex.git')
    expect(urlDeRepositorio('git@github.com:coltrox/cortex.git')).toBe('git@github.com:coltrox/cortex.git')
  })

  it('tira espaco das pontas e a barra do fim', () => {
    expect(urlDeRepositorio('  https://github.com/coltrox/cortex/  ')).toBe('https://github.com/coltrox/cortex')
  })

  it('recusa o que nao e endereco de repositorio', () => {
    expect(urlDeRepositorio('')).toBeNull()
    expect(urlDeRepositorio('github.com/coltrox/cortex')).toBeNull()
    expect(urlDeRepositorio('http://github.com/coltrox/cortex')).toBeNull()
    expect(urlDeRepositorio('https://github.com/coltrox')).toBeNull()
  })

  it('recusa tentativa de emendar comando', () => {
    expect(urlDeRepositorio('https://github.com/a/b; rm -rf /')).toBeNull()
    expect(urlDeRepositorio('https://github.com/a/b && echo oi')).toBeNull()
    expect(urlDeRepositorio('https://github.com/a/b`whoami`')).toBeNull()
  })
})

describe('a mensagem do commit', () => {
  it('apara e corta o que passa do limite', () => {
    expect(mensagemDeCommit('  ajuste na tela  ')).toBe('ajuste na tela')
    expect(mensagemDeCommit('a'.repeat(600))).toHaveLength(500)
  })

  it('vazia vira a padrao', () => {
    expect(mensagemDeCommit('')).toBe('Mudanças do dia')
    expect(mensagemDeCommit('   \n ')).toBe('Mudanças do dia')
  })
})

describe('a leitura do estado', () => {
  it('conta os arquivos alterados', () => {
    expect(contarAlterados(' M src/a.ts\n?? novo.txt\n D velho.txt')).toBe(3)
    expect(contarAlterados('')).toBe(0)
    expect(contarAlterados('\n\n')).toBe(0)
  })

  it('conta os commits que faltam subir', () => {
    expect(contarAFrente('3\n')).toBe(3)
    expect(contarAFrente('0')).toBe(0)
    // Sem ramo remoto o comando falha e imprime erro: zero.
    expect(contarAFrente('fatal: no upstream configured')).toBe(0)
  })
})
