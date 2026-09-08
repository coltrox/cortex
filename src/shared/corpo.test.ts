import { describe, it, expect } from 'vitest'
import { semDependenciasDaRede, semColchetesDeLink } from './corpo'

describe('semDependenciasDaRede', () => {
  it('tira a secao de links e a regua que a fecha', () => {
    // A forma real de uma nota deste vault: o bloco de links no topo, logo
    // depois do frontmatter, fechado por uma regua.
    const corpo = [
      '### Dependencias da Rede',
      '- [[Esteira 30 min]]',
      '- [[Perfil fisico]]',
      '',
      '---',
      '',
      'Trinta minutos, de segunda a sexta.'
    ].join('\n')
    expect(semDependenciasDaRede(corpo)).toBe('Trinta minutos, de segunda a sexta.')
  })

  it('um titulo de mesmo nivel fecha a secao e fica', () => {
    const corpo = ['### Dependencias da Rede', '- [[A]]', '### Como faz', 'Primeiro isto.'].join('\n')
    expect(semDependenciasDaRede(corpo)).toBe('### Como faz\nPrimeiro isto.')
  })

  it('so link, branco e regua somem; o resto encerra o corte', () => {
    const corpo = ['### Dependencias da Rede', '- [[A]]', '#### Notas irmas', 'Isto fica.'].join('\n')
    expect(semDependenciasDaRede(corpo)).toBe('#### Notas irmas\nIsto fica.')
  })

  it('sem regua e sem outro titulo, o texto da nota nao e comido', () => {
    // O caso que derrubou a primeira versao: ela ia do titulo ate o proximo
    // titulo de nivel igual ou maior, e sem nenhum dos dois comia tudo.
    const corpo = '### Dependencias da Rede\n- [[A]]\n\nTrinta minutos, de segunda a sexta.'
    expect(semDependenciasDaRede(corpo)).toBe('Trinta minutos, de segunda a sexta.')
  })

  it('acento, caixa e a aranha nao escondem a secao', () => {
    // A nota de verdade escreve com acento e com um emoji de teia na frente.
    expect(semDependenciasDaRede('### DEPENDENCIAS DA REDE\n- [[A]]\n\nFica.')).toBe('Fica.')
    expect(semDependenciasDaRede('### Dependencias da Rede\n- [[A]]\n\nFica.')).toBe('Fica.')
  })

  it('nao mexe em texto que nao tem a secao', () => {
    const corpo = '## Como faz\n\n- Um passo\n- Outro passo'
    expect(semDependenciasDaRede(corpo)).toBe(corpo)
  })

  it('uma regua no meio do texto normal nao e engolida', () => {
    const corpo = 'Antes.\n\n---\n\nDepois.'
    expect(semDependenciasDaRede(corpo)).toBe(corpo)
  })

  it('rodar duas vezes da no mesmo', () => {
    // Idempotencia importa: a regra roda no Cortex (ao publicar) E no
    // celular (ao desenhar), e o corpo passa pelas duas.
    const corpo = '### Dependencias da Rede\n- [[A]]\n\n---\n\nO texto.'
    const uma = semDependenciasDaRede(corpo)
    expect(semDependenciasDaRede(uma)).toBe(uma)
  })
})

describe('semColchetesDeLink', () => {
  it('deixa o nome e tira os colchetes', () => {
    expect(semColchetesDeLink('ver [[Esteira 30 min]] depois'))
      .toBe('ver Esteira 30 min depois')
  })

  it('com apelido, vence o apelido', () => {
    // Foi ele que a pessoa escreveu para ser lido.
    expect(semColchetesDeLink('[[Saude/Treinos/Push A|o treino de peito]]'))
      .toBe('o treino de peito')
  })

  it('a ancora some junto', () => {
    // Aponta para um pedaco de um arquivo que nao existe deste lado.
    expect(semColchetesDeLink('[[Perfil fisico#Medidas]]')).toBe('Perfil fisico')
  })

  it('varios na mesma linha', () => {
    expect(semColchetesDeLink('[[A]] e [[B]]')).toBe('A e B')
  })

  it('nao confunde com link de markdown', () => {
    // `[texto](url)` tem UM colchete, e continua sendo link clicavel.
    const md = 'veja [a inscricao](https://unicamp.br)'
    expect(semColchetesDeLink(md)).toBe(md)
  })

  it('texto sem colchete nenhum passa intacto', () => {
    expect(semColchetesDeLink('Trinta minutos.')).toBe('Trinta minutos.')
  })
})
