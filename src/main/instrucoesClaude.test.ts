import { describe, it, expect } from 'vitest'
import { instrucoesParaClaude } from './instrucoesClaude'

describe('CLAUDE.md do vault', () => {
  const texto = instrucoesParaClaude(['vida', 'saude', 'financas'])

  it('apresenta o app ANTES de entrevistar a pessoa', () => {
    // Quem nunca viu o Cortex nao sabe responder "quais sao seus treinos?"
    // sem entender para onde aquilo vai.
    const panorama = texto.indexOf('## 1. Primeiro: apresente o app')
    const entrevista = texto.indexOf('## 2. Depois: entreviste a pessoa')
    expect(panorama).toBeGreaterThan(-1)
    expect(entrevista).toBeGreaterThan(panorama)
  })

  it('so pergunta sobre as areas que a pessoa ligou', () => {
    expect(texto).toContain('### Saúde')
    expect(texto).toContain('### Grana')
    expect(texto).not.toContain('### Estudos')
    expect(texto).not.toContain('### Dev')
    expect(texto).toContain('Vida, Saúde, Grana')
  })

  it('explica que o texto do diario e o resumo do dia escrito pelo Claude', () => {
    expect(texto).toContain('## 4. O diário')
    expect(texto).toContain('## Como foi o dia')
    expect(texto).toMatch(/TUDO\s+que foi registrado no dia/)
  })

  it('diz o que nunca tocar', () => {
    expect(texto).toContain('.vault/')
    expect(texto).toContain('Vida/Contas')
  })

  it('sem area ligada, nao deixa a secao da entrevista vazia', () => {
    expect(instrucoesParaClaude([])).toContain('Nenhuma área ligada além do Hoje')
  })
})
