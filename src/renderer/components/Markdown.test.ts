import { describe, it, expect } from 'vitest'
import { simboloDe } from './Markdown'

/*
 * O defeito que originou este teste: a nota de matemática trazia
 * `S = -\frac{b}{a} \qquad P = \frac{c}{a}`, e a tela mostrou
 * "S = - b/a qquad P = c/a" — o comando desconhecido saiu impresso por
 * extenso no meio da conta.
 *
 * Fórmula é conteúdo de estudo: um comando que falta aqui não quebra o app,
 * só ensina errado. Por isso o teste cobre por LISTA, e não caso a caso.
 */

const PRECISAM_EXISTIR = [
  // espaçamento entre fórmulas na mesma linha
  'quad', 'qquad',
  // letras gregas de física e química
  'alpha', 'beta', 'gamma', 'delta', 'Delta', 'theta', 'lambda', 'mu', 'pi',
  'rho', 'sigma', 'tau', 'omega', 'Omega', 'phi', 'Phi',
  // operadores e relações
  'cdot', 'times', 'div', 'pm', 'neq', 'ne', 'leq', 'geq', 'le', 'ge',
  'approx', 'equiv', 'propto', 'infty', 'iff', 'implies', 'rightarrow', 'to',
  // funções escritas em letra reta
  'log', 'ln', 'sen', 'sin', 'cos', 'tan', 'tg', 'lim', 'det', 'exp',
  // conjuntos
  'in', 'notin', 'subset', 'cup', 'cap', 'emptyset', 'forall', 'exists',
  // somatório e companhia
  'sum', 'prod', 'int', 'partial', 'degree', 'ldots', 'cdots'
]

describe('simboloDe', () => {
  for (const nome of PRECISAM_EXISTIR) {
    it(`entende ${nome}`, () => {
      const s = simboloDe(nome)
      expect(s).not.toBeNull()
      expect(s).not.toBe('')
    })
  }

  it('qquad e quad viram espaco de verdade, e nao a palavra', () => {
    expect(simboloDe('quad')).toBe(' ')
    expect(simboloDe('qquad')).toBe('  ')
  })

  it('as funcoes saem em letra reta, como se escrevem', () => {
    expect(simboloDe('log')).toBe('log')
    expect(simboloDe('det')).toBe('det')
    expect(simboloDe('sin')).toBe('sen')
    expect(simboloDe('tan')).toBe('tg')
  })

  it('simbolo nunca sai como o proprio nome do comando', () => {
    // Seria o bug de novo, silencioso: "times" escrito no lugar de "×".
    for (const nome of ['times', 'cdot', 'alpha', 'iff', 'qquad', 'infty']) {
      expect(simboloDe(nome)).not.toBe(nome)
    }
  })

  it('comando que nao existe devolve null, para quem chama decidir', () => {
    expect(simboloDe('comandoInventado')).toBeNull()
    expect(simboloDe('')).toBeNull()
  })
})
