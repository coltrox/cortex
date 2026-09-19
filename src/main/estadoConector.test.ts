import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { estadoDoConector, lerEstadoDoConector } from './estadoConector'

const EXE = 'C:\\Users\\x\\AppData\\Local\\Programs\\Cortex\\Cortex.exe'

describe('estado do conector do Claude', () => {
  it('conectado quando o "cortex" aponta para ESTE Cortex', () => {
    expect(estadoDoConector({ mcpServers: { cortex: { command: EXE } } }, EXE)).toBe('conectado')
    // Barra e caixa diferentes são o mesmo caminho no Windows.
    expect(estadoDoConector({ mcpServers: { cortex: { command: EXE.toLowerCase().replace(/\\/g, '/') } } }, EXE)).toBe('conectado')
  })

  it('outra instalação quando aponta para outro lugar (versão antiga, app de dev)', () => {
    expect(estadoDoConector({ mcpServers: { cortex: { command: 'C:\\dev\\electron.exe' } } }, EXE)).toBe('outra-instalacao')
  })

  it('desconectado sem a entrada, ou com a configuração estranha', () => {
    expect(estadoDoConector({ mcpServers: {} }, EXE)).toBe('desconectado')
    expect(estadoDoConector({}, EXE)).toBe('desconectado')
    expect(estadoDoConector(null, EXE)).toBe('desconectado')
    expect(estadoDoConector({ mcpServers: { cortex: 'x' } }, EXE)).toBe('desconectado')
  })

  it('lê do arquivo, e arquivo que não existe ou quebrado é desconectado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cortex-claude-'))
    try {
      const arq = join(dir, '.claude.json')
      expect(await lerEstadoDoConector(arq, EXE)).toBe('desconectado')
      await writeFile(arq, JSON.stringify({ mcpServers: { cortex: { command: EXE } } }), 'utf8')
      expect(await lerEstadoDoConector(arq, EXE)).toBe('conectado')
      await writeFile(arq, '{ quebrado', 'utf8')
      expect(await lerEstadoDoConector(arq, EXE)).toBe('desconectado')
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
