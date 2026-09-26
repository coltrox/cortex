import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

// O terminal de dentro do Cortex (2.6.30) e o × que fecha um terminal vivo.
describe('Processos.iniciarComando', () => {
  it('roda a linha digitada na pasta pedida', async () => {
    const ps = new Processos()
    const p = ps.iniciarComando('raiz', tmpdir(), 'node -e console.log(7*6)')
    const fim = await esperar(ps, p.id)
    expect(fim.saiu).toBe(0)
    expect(ps.saida(p.id)).toContain('42')
  }, 30_000)

  it('a linha inteira vira o nome do terminal, para dar para reconhecer', () => {
    const ps = new Processos()
    const p = ps.iniciarComando('raiz', tmpdir(), '  node -e console.log(1)  ')
    expect(p.script).toBe('node -e console.log(1)')
    ps.parar(p.id)
  })
})

describe('Processos.esquecer', () => {
  it('um terminal fechado enquanto rodava some da lista quando termina', async () => {
    const ps = new Processos()
    // Um processo que não acaba sozinho: é o caso do × no `npm run dev`.
    const p = ps.iniciarComando('raiz', tmpdir(), 'node -e setInterval(Object,1000)')
    ps.parar(p.id)
    // Esquecer ANTES de o processo terminar — era aqui que a aba ficava presa.
    ps.esquecer(p.id)
    for (let i = 0; i < 300 && ps.listar().some(x => x.id === p.id); i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(ps.listar().some(x => x.id === p.id)).toBe(false)
  }, 30_000)
})

// A etapa condicional do clone: o 'npm install' só roda se houver package.json.
describe('Etapa.seTiver', () => {
  it('pula a etapa quando o arquivo pedido não existe na pasta', async () => {
    const ps = new Processos()
    const cwd = tmpdir()
    const p = ps.iniciarEtapas('raiz', 'clonar teste', [
      { comando: 'node', args: ['-e', 'console.log(1)'], cwd },
      { comando: 'node', args: ['-e', 'console.log(2)'], cwd, seTiver: 'nao-existe-package.json' },
      { comando: 'node', args: ['-e', 'console.log(3)'], cwd }
    ])
    const fim = await esperar(ps, p.id)
    expect(fim.saiu).toBe(0)
    const linhas = ps.saida(p.id)
    expect(linhas).toContain('1')
    expect(linhas).not.toContain('2')
    expect(linhas).toContain('3')
  }, 30_000)

  it('roda a etapa quando o arquivo existe', async () => {
    const ps = new Processos()
    const pasta = mkdtempSync(join(tmpdir(), 'cortex-clone-'))
    writeFileSync(join(pasta, 'package.json'), '{}')
    const p = ps.iniciarEtapas('raiz', 'clonar teste', [
      { comando: 'node', args: ['-e', 'console.log(9)'], cwd: pasta, seTiver: 'package.json' }
    ])
    const fim = await esperar(ps, p.id)
    expect(fim.saiu).toBe(0)
    expect(ps.saida(p.id)).toContain('9')
  }, 30_000)
})
