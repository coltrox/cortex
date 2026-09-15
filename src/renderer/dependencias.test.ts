import { describe, it, expect } from 'vitest'
import { semDependenciasDaRede } from './dados'

describe('leitura da nota sem a secao Dependencias da Rede', () => {
  it('tira o titulo, a lista e o --- logo abaixo', () => {
    const texto = [
      '### 🕸️ Dependências da Rede',
      '- [[Silvio]]',
      '- [[Shirlei]]',
      '',
      '---',
      '',
      '# Sonia',
      'texto'
    ].join('\n')
    const saida = semDependenciasDaRede(texto).split('\n')
    expect(saida.slice(0, 5).every(l => l === '')).toBe(true)
    expect(saida).toContain('# Sonia')
    expect(saida).toContain('texto')
  })

  it('mantem o numero de linhas, para marcar tarefa continuar certo', () => {
    const texto = '### Dependências da Rede\n- [[A]]\n\n- [ ] tarefa'
    const saida = semDependenciasDaRede(texto)
    expect(saida.split('\n')).toHaveLength(texto.split('\n').length)
  })

  it('para no primeiro texto que nao e lista', () => {
    const texto = '### Dependências da Rede\n- [[A]]\nParagrafo que fica'
    expect(semDependenciasDaRede(texto)).toContain('Paragrafo que fica')
  })

  it('nao mexe em nota sem a secao', () => {
    const texto = '# Titulo\n- item\n\ntexto'
    expect(semDependenciasDaRede(texto)).toBe(texto)
  })
})
