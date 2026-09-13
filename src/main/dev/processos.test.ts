import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { Processos, type ProcessoInfo } from './processos'

/** Espera o processo terminar, conferindo a lista como a tela confere. */
async function esperar(ps: Processos, id: string): Promise<ProcessoInfo> {
  for (let i = 0; i < 300; i++) {
    const p = ps.listar().find(x => x.id === id)
    if (p && p.saiu !== null) return p
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error('o processo nao terminou')
}

// Sem aspas e sem espacos nos argumentos: no Windows o spawn passa pelo shell.
describe('Processos.iniciarEtapas', () => {
  it('roda as etapas em ordem, como um processo so', async () => {
    const ps = new Processos()
    const cwd = tmpdir()
    const p = ps.iniciarEtapas('raiz', 'criar teste', [
      { comando: 'node', args: ['-e', 'console.log(40+2)'], cwd },
      { comando: 'node', args: ['-e', 'console.log(40+3)'], cwd }
    ])
    const fim = await esperar(ps, p.id)
    expect(fim.saiu).toBe(0)
    const linhas = ps.saida(p.id)
    expect(linhas.indexOf('42')).toBeGreaterThanOrEqual(0)
    expect(linhas.indexOf('43')).toBeGreaterThan(linhas.indexOf('42'))
  }, 30_000)

  it('uma etapa que falha encerra a sequencia e as seguintes nao rodam', async () => {
    const ps = new Processos()
    const cwd = tmpdir()
    const p = ps.iniciarEtapas('raiz', 'criar teste', [
      { comando: 'node', args: ['-e', 'process.exit(3)'], cwd },
      { comando: 'node', args: ['-e', 'console.log(99)'], cwd }
    ])
    const fim = await esperar(ps, p.id)
    expect(fim.saiu).toBe(3)
    expect(ps.saida(p.id)).not.toContain('99')
  }, 30_000)
})
