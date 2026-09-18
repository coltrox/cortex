import { describe, it, expect } from 'vitest'
import { normalizarNome, comandoDe, NOME_VALIDO, GRUPOS, grupoDe, filtrarGrupos, filtrarOpcoes } from './NovoProjeto'
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
    expect(grupoDe('flutter').nome).toBe('Dart')
  })
})

describe('busca de linguagem no novo projeto', () => {
  const nomes = (t: string): string[] => filtrarGrupos(t).map(g => g.nome)

  it('vazio mostra todas', () => {
    expect(filtrarGrupos('  ')).toHaveLength(GRUPOS.length)
  })

  it('acha pelo nome, sem caixa e sem acento', () => {
    expect(nomes('JAVA')).toContain('Java')
    expect(nomes('pytho')).toEqual(['Python'])
  })

  it('so o que COMECA com a letra, e o nome exato primeiro', () => {
    // Era "contem": um "c" trazia JavaScript, Python e Java junto.
    expect(nomes('c')).toEqual(['C', 'C#', 'C++'])
    expect(nomes('r')).toEqual(['Rust', 'Ruby'])
    expect(nomes('p')).toEqual(['Python', 'PHP'])
    expect(nomes('k')).toEqual(['Kotlin'])
  })

  it('acha pelo apelido e pelo nome da aplicacao', () => {
    expect(nomes('golang')).toEqual(['Go'])
    expect(nomes('flutter')).toEqual(['Dart'])
    expect(nomes('rails')).toEqual(['Ruby'])
    // "API" mora em varias linguagens.
    expect(nomes('api')).toEqual(expect.arrayContaining(['JavaScript / TypeScript', 'Python', 'C#', 'Go']))
  })

  it('nada casando devolve lista vazia', () => {
    expect(filtrarGrupos('cobol')).toEqual([])
  })
})

describe('cascata generica do novo projeto', () => {
  const opcoes = [
    { id: 'vite', titulo: 'React + Vite', etiqueta: 'Frontend' },
    { id: 'node-api', titulo: 'API com Express', etiqueta: 'Backend' },
    { id: 'expo', titulo: 'Expo', etiqueta: 'Mobile' }
  ]

  it('vazio devolve todas', () => {
    expect(filtrarOpcoes(opcoes, '  ')).toEqual(opcoes)
  })

  it('acha pelo comeco de qualquer palavra do nome ou da etiqueta, sem acento', () => {
    expect(filtrarOpcoes(opcoes, 'vi').map(o => o.id)).toEqual(['vite'])
    expect(filtrarOpcoes(opcoes, 'express').map(o => o.id)).toEqual(['node-api'])
    expect(filtrarOpcoes(opcoes, 'MOB').map(o => o.id)).toEqual(['expo'])
  })

  it('nao acha pelo meio da palavra', () => {
    expect(filtrarOpcoes(opcoes, 'ite')).toEqual([])
  })
})
