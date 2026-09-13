import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { instrucoesParaClaude, gravarSeMudou } from './instrucoesClaude'

const VAULT = {
  pasta: 'C:\\Users\\x\\AppData\\Roaming\\Cortex\\vaults\\vault-oficial',
  relativo: 'vaults/vault-oficial'
}

describe('CLAUDE.md da pasta de dados do Cortex', () => {
  const texto = instrucoesParaClaude(['vida', 'saude', 'financas'], VAULT)

  it('diz onde fica o vault ANTES de tudo, e que o resto da pasta e do app', () => {
    // O arquivo mora em AppData\Roaming\Cortex, ao lado de Cache e cortex.json:
    // sem isto o Claude escreveria notas na pasta do app.
    expect(texto).toContain('vaults/vault-oficial')
    expect(texto).toContain(VAULT.pasta)
    expect(texto).toContain('cortex.json')
    expect(texto.indexOf('## Onde fica o vault')).toBeGreaterThan(-1)
    expect(texto.indexOf('## Onde fica o vault')).toBeLessThan(texto.indexOf('## 1. Primeiro'))
  })

  it('vault fora da pasta de dados aparece pelo caminho completo', () => {
    const t = instrucoesParaClaude([], { pasta: 'D:\\Notas', relativo: null })
    expect(t).toContain('**`D:\\Notas`**')
  })

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
    expect(instrucoesParaClaude([], VAULT)).toContain('Nenhuma área ligada além do Hoje')
  })
})

describe('gravarSeMudou', () => {
  it('grava quando nao existe, nao regrava o mesmo texto, e troca quando muda', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'cortex-claude-'))
    try {
      const arq = join(pasta, 'CLAUDE.md')
      expect(await gravarSeMudou(arq, 'um')).toBe(true)
      expect(await readFile(arq, 'utf8')).toBe('um')
      expect(await gravarSeMudou(arq, 'um')).toBe(false)
      expect(await gravarSeMudou(arq, 'dois')).toBe(true)
      expect(await readFile(arq, 'utf8')).toBe('dois')
    } finally {
      await rm(pasta, { recursive: true, force: true })
    }
  })
})
