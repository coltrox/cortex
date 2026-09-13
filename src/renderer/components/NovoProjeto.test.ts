import { describe, it, expect } from 'vitest'
import { normalizarNome, comandoDe, NOME_VALIDO } from './NovoProjeto'
import { nomeDeProjetoValido } from '../../main/dev/novoProjeto'

describe('nome digitado no novo projeto', () => {
  it('vira um nome aceitavel enquanto se digita', () => {
    expect(normalizarNome('Meu App')).toBe('meu-app')
    expect(normalizarNome('Loja Ção & Cia')).toBe('loja-cao--cia')
    expect(normalizarNome('app"; del *')).toBe('app-del-')
  })

  it('a tela e o processo principal usam a mesma regra', () => {
    // Se divergirem, a tela libera o botao e o processo principal recusa.
    for (const n of ['meu-app', 'a', '1a', 'A', 'a b', 'a'.repeat(60), 'a'.repeat(61)]) {
      expect(NOME_VALIDO.test(n)).toBe(nomeDeProjetoValido(n))
    }
  })

  it('mostra o comando que vai rodar', () => {
    expect(comandoDe('expo', 'ts', 'x')).toBe('npx create-expo-app@latest x --template blank-typescript')
    expect(comandoDe('vite', 'js', 'x')).toContain('--template react')
    expect(comandoDe('vite', 'js', 'x')).toContain('npm install')
  })
})
