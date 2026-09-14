import { describe, it, expect } from 'vitest'
import { normalizarNome, comandoDe, NOME_VALIDO, GRUPOS, grupoDe } from './NovoProjeto'
import { nomeDeProjetoValido, MODELOS_PROJETO, usaLinguagem } from '../../main/dev/novoProjeto'

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
    expect(comandoDe('electron', 'ts', 'x')).toContain('--template=vite-typescript')
    expect(comandoDe('electron', 'js', 'x')).toContain('--template=vite')
    expect(comandoDe('fastapi', 'ts', 'x')).toContain('pip install')
    expect(comandoDe('csharp-api', 'ts', 'x')).toBe('dotnet new webapi --name x')
  })
})

describe('grupos do novo projeto', () => {
  it('todo modelo que o processo principal aceita aparece em exatamente um grupo', () => {
    // Um modelo fora da tela nunca seria criado; um modelo na tela que o
    // processo principal nao conhece daria "modelo invalido" no botao.
    const naTela = GRUPOS.flatMap(g => g.modelos.map(m => m.id))
    expect([...naTela].sort()).toEqual([...MODELOS_PROJETO].sort())
    expect(new Set(naTela).size).toBe(naTela.length)
  })

  it('so os grupos de JavaScript perguntam TypeScript ou JavaScript', () => {
    // A tela e o processo principal precisam concordar sobre quem usa a escolha.
    for (const g of GRUPOS) for (const m of g.modelos) expect(usaLinguagem(m.id)).toBe(g.ts)
  })

  it('acha o grupo de cada modelo', () => {
    expect(grupoDe('electron').nome).toBe('JavaScript / TypeScript')
    expect(grupoDe('flask').nome).toBe('Python')
    expect(grupoDe('csharp-winforms').nome).toBe('C#')
  })
})
