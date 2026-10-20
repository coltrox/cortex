import { describe, it, expect } from 'vitest'
import { blocos, pedacos, formulaLegivel } from './markdown'

describe('blocos', () => {
  it('titulo com nivel', () => {
    expect(blocos('## Energia')).toEqual([{ tipo: 'titulo', nivel: 2, texto: 'Energia' }])
  })

  it('junta linhas do mesmo paragrafo', () => {
    // As notas do vault quebram a linha em 76 colunas; no celular isso
    // precisa virar um paragrafo so, senao cada linha vira um bloco.
    expect(blocos('Potência é energia\npor tempo.'))
      .toEqual([{ tipo: 'paragrafo', texto: 'Potência é energia por tempo.' }])
  })

  it('linha em branco separa paragrafos', () => {
    const r = blocos('Um.\n\nDois.')
    expect(r).toHaveLength(2)
    expect(r.every(b => b.tipo === 'paragrafo')).toBe(true)
  })

  it('lista com hifen', () => {
    expect(blocos('- um\n- dois'))
      .toEqual([{ tipo: 'lista', numerada: false, itens: ['um', 'dois'] }])
  })

  it('lista numerada', () => {
    expect(blocos('1. um\n2. dois')[0])
      .toEqual({ tipo: 'lista', numerada: true, itens: ['um', 'dois'] })
  })

  it('continuacao indentada entra no item anterior', () => {
    expect(blocos('- primeira parte\n  segunda parte\n- outro')[0]).toEqual({
      tipo: 'lista', numerada: false,
      itens: ['primeira parte segunda parte', 'outro']
    })
  })

  it('tarefa nao vira lista comum', () => {
    // `- [ ]` tambem comeca com hifen: a ordem do teste no parser importa.
    expect(blocos('- [ ] fazer\n- [x] feito')[0]).toEqual({
      tipo: 'tarefa',
      itens: [{ texto: 'fazer', feito: false }, { texto: 'feito', feito: true }]
    })
  })

  it('tabela com cabecalho e linhas', () => {
    expect(blocos('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')[0]).toEqual({
      tipo: 'tabela',
      cabecalho: ['a', 'b'],
      linhas: [['1', '2'], ['3', '4']]
    })
  })

  it('linha com pipe mas sem separador NAO vira tabela', () => {
    expect(blocos('isto | aquilo')[0].tipo).toBe('paragrafo')
  })

  it('formula de bloco entre $$ sozinhos', () => {
    expect(blocos('$$\nE = mc^2\n$$')[0]).toEqual({ tipo: 'formula', texto: 'E = mc^2' })
  })

  it('citacao', () => {
    expect(blocos('> atenção\n> aqui')[0]).toEqual({ tipo: 'citacao', texto: 'atenção aqui' })
  })

  it('regra horizontal', () => {
    expect(blocos('---')[0]).toEqual({ tipo: 'regra' })
  })

  it('bloco de codigo preserva as linhas', () => {
    expect(blocos('```\num\ndois\n```')[0]).toEqual({ tipo: 'codigo', texto: 'um\ndois' })
  })

  it('texto vazio nao quebra', () => {
    expect(blocos('')).toEqual([])
    expect(blocos(undefined as unknown as string)).toEqual([])
  })

  it('nota de verdade: titulo, paragrafo, formula e tabela juntos', () => {
    const nota = [
      '## 1. Potência',
      '',
      'Potência é energia por tempo.',
      '',
      '$$',
      'P = \\frac{E}{\\Delta t}',
      '$$',
      '',
      '| grandeza | unidade |',
      '|---|---|',
      '| potência | watt |'
    ].join('\n')
    expect(blocos(nota).map(b => b.tipo))
      .toEqual(['titulo', 'paragrafo', 'formula', 'tabela'])
  })
})

describe('pedacos', () => {
  it('negrito', () => {
    expect(pedacos('é **assim** aqui')).toEqual([
      { tipo: 'texto', texto: 'é ' },
      { tipo: 'forte', texto: 'assim' },
      { tipo: 'texto', texto: ' aqui' }
    ])
  })

  it('negrito vence italico, e nao vira italico torto', () => {
    expect(pedacos('**forte**')).toEqual([{ tipo: 'forte', texto: 'forte' }])
  })

  it('italico', () => {
    expect(pedacos('*leve*')).toEqual([{ tipo: 'enfase', texto: 'leve' }])
  })

  it('codigo e link', () => {
    expect(pedacos('`x` e [[Nota]]')).toEqual([
      { tipo: 'codigo', texto: 'x' },
      { tipo: 'texto', texto: ' e ' },
      { tipo: 'link', texto: 'Nota' }
    ])
  })

  it('formula em linha vira texto legivel', () => {
    expect(pedacos('vale $\\pi r^2$ aqui')[1]).toEqual({ tipo: 'formula', texto: 'π r^2' })
  })

  it('texto sem marcacao volta inteiro', () => {
    expect(pedacos('nada aqui')).toEqual([{ tipo: 'texto', texto: 'nada aqui' }])
  })

  it('linha vazia nao gera pedaco', () => {
    expect(pedacos('')).toEqual([])
  })
})

describe('formulaLegivel', () => {
  it('troca os comandos conhecidos pelo simbolo', () => {
    expect(formulaLegivel('a \\times b \\le c')).toBe('a × b ≤ c')
  })

  it('fracao vira divisao com parenteses', () => {
    expect(formulaLegivel('\\frac{E}{\\Delta t}')).toBe('(E)/(Δ t)')
  })

  it('text vira o conteudo', () => {
    expect(formulaLegivel('\\text{sen } x')).toBe('sen x')
  })

  it('raiz', () => {
    expect(formulaLegivel('\\sqrt{2gh}')).toBe('√(2gh)')
  })

  it('comando desconhecido fica visivel em vez de sumir', () => {
    // Apagar em silencio tiraria um pedaco da formula sem ninguem notar.
    expect(formulaLegivel('\\oint x')).toBe('\\oint x')
  })
})
