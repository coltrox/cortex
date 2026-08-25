import { describe, it, expect } from 'vitest'
import { parseNote } from './parser'
import { template, pastaSugerida, nomeSugerido, type Tipo } from './templates'

const TIPOS: Tipo[] = [
  'nota', 'projeto', 'diario', 'treino', 'exercicio',
  'consulta', 'materia', 'prova', 'questao', 'objetivo',
  'habito', 'pessoa', 'viagem'
]

const HOJE = '2026-08-25'

describe('template', () => {
  for (const tipo of TIPOS) {
    it(`${tipo}: gera frontmatter que parseNote lê sem parseError`, () => {
      const md = template(tipo, HOJE)
      const nota = parseNote(md)
      expect(nota.parseError).toBeNull()
      expect(nota.frontmatter.tipo).toBe(tipo)
      expect(nota.frontmatter.date).toBe(HOJE)
    })

    it(`${tipo}: contém a seção de Dependências da Rede`, () => {
      const md = template(tipo, HOJE)
      expect(md).toContain('### 🕸️ Dependências da Rede')
    })
  }

  it('diario: carrega peso, refeicoes e gastos como listas de objetos, e corpo com "## Como foi o dia"', () => {
    const md = template('diario', HOJE)
    const nota = parseNote(md)
    expect(nota.parseError).toBeNull()
    expect('peso' in nota.frontmatter).toBe(true)
    expect(Array.isArray(nota.frontmatter.refeicoes)).toBe(true)
    expect(Array.isArray(nota.frontmatter.gastos)).toBe(true)
    const gasto = (nota.frontmatter.gastos as unknown[])[0] as Record<string, unknown>
    expect(typeof gasto).toBe('object')
    expect('hora' in gasto).toBe(true)
    expect('item' in gasto).toBe(true)
    expect('valor' in gasto).toBe(true)
    expect('cat' in gasto).toBe(true)
    expect(md).toContain('## Como foi o dia')
  })

  it('treino: segue o modelo do autor (grupo + lista de exercicios)', () => {
    const md = template('treino', HOJE)
    const nota = parseNote(md)
    expect(nota.parseError).toBeNull()
    expect('grupo' in nota.frontmatter).toBe(true)
    expect(Array.isArray(nota.frontmatter.exercicios)).toBe(true)
    const ex = (nota.frontmatter.exercicios as unknown[])[0] as Record<string, unknown>
    expect('nome' in ex).toBe(true)
    expect('series' in ex).toBe(true)
    expect('reps' in ex).toBe(true)
    expect('carga' in ex).toBe(true)
  })
})

describe('pastaSugerida', () => {
  const casos: [Tipo, string][] = [
    ['diario', 'Diario'],
    ['treino', 'Saude'],
    ['exercicio', 'Saude'],
    ['consulta', 'Saude'],
    ['materia', 'Estudos'],
    ['prova', 'Estudos'],
    ['questao', 'Estudos'],
    ['objetivo', 'Vida'],
    ['habito', 'Vida'],
    ['pessoa', 'Vida'],
    ['viagem', 'Viagens'],
    ['projeto', 'Projetos'],
    ['nota', 'Notas']
  ]

  for (const [tipo, pasta] of casos) {
    it(`${tipo} -> ${pasta}`, () => {
      expect(pastaSugerida(tipo)).toBe(pasta)
    })
  }
})

describe('nomeSugerido', () => {
  it('diario: usa a data', () => {
    expect(nomeSugerido('diario', HOJE)).toBe('2026-08-25.md')
  })

  it('treino: usa a data, mesmo com título fornecido', () => {
    expect(nomeSugerido('treino', HOJE, 'Peito e Tríceps')).toBe('2026-08-25.md')
  })

  it('outros tipos: usa o título higienizado', () => {
    expect(nomeSugerido('projeto', HOJE, 'Nima')).toBe('Nima.md')
  })

  it('remove barra e dois-pontos do título', () => {
    expect(nomeSugerido('nota', HOJE, 'API: rate/limit')).toBe('API ratelimit.md')
  })

  it('sem título: usa o próprio tipo', () => {
    expect(nomeSugerido('materia', HOJE)).toBe('materia.md')
  })
})
