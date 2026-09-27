import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

// O terminal de dentro do Cortex: um shell que fica vivo esperando linhas.
describe('Processos.abrirShell', () => {
  /** Espera uma linha aparecer na saída do terminal. */
  const esperarLinha = async (ps: Processos, id: string, texto: string): Promise<boolean> => {
    for (let i = 0; i < 200; i++) {
      if (ps.saida(id).some(l => l.includes(texto))) return true
      await new Promise(r => setTimeout(r, 50))
    }
    return false
  }

  it('os comandos seguem no MESMO terminal, e o cd continua valendo', async () => {
    const ps = new Processos()
    const pasta = mkdtempSync(join(tmpdir(), 'cortex-shell-'))
    mkdirSync(join(pasta, 'dentro'))
    const p = ps.abrirShell('raiz', pasta)
    expect(p.ehShell).toBe(true)

    ps.enviar(p.id, 'node -e "console.log(7*6)"')
    expect(await esperarLinha(ps, p.id, '42')).toBe(true)

    // O cd de um comando vale no seguinte: é isso que separa uma sessão de
    // comandos soltos.
    ps.enviar(p.id, 'cd dentro')
    ps.enviar(p.id, 'node -e "console.log(process.cwd())"')
    expect(await esperarLinha(ps, p.id, 'dentro')).toBe(true)

    // E tudo isso num processo só: a tela não ganhou aba nenhuma.
    expect(ps.listar().filter(x => x.ehShell).length).toBe(1)
    ps.parar(p.id)
  }, 30_000)

  it('o comando aparece na saída com o sinal na frente', async () => {
    const ps = new Processos()
    const p = ps.abrirShell('raiz', tmpdir())
    ps.enviar(p.id, 'node -e "console.log(1)"')
    expect(await esperarLinha(ps, p.id, '› node -e')).toBe(true)
    ps.parar(p.id)
  }, 30_000)

  it('recusa mandar linha para um terminal que já fechou', async () => {
    const ps = new Processos()
    const p = ps.abrirShell('raiz', tmpdir())
    ps.parar(p.id)
    for (let i = 0; i < 200 && ps.listar().find(x => x.id === p.id)?.saiu === null; i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(() => ps.enviar(p.id, 'node -e "console.log(1)"')).toThrow(/não está mais aberto/)
  }, 30_000)

  it('entrarNaPasta leva o terminal para a pasta clicada', async () => {
    const ps = new Processos()
    const pasta = mkdtempSync(join(tmpdir(), 'cortex-shell-'))
    const dentro = join(pasta, 'sub')
    mkdirSync(dentro)
    const p = ps.abrirShell('raiz', pasta)
    ps.entrarNaPasta(p.id, dentro)
    ps.enviar(p.id, 'node -e "console.log(process.cwd())"')
    expect(await esperarLinha(ps, p.id, 'sub')).toBe(true)
    expect(ps.listar().find(x => x.id === p.id)?.cwd).toBe(dentro)
    ps.parar(p.id)
  }, 30_000)
})

describe('Processos.esquecer', () => {
  it('um terminal fechado enquanto rodava some da lista quando termina', async () => {
    const ps = new Processos()
    // Um terminal vivo, que não acaba sozinho: é o caso do × no terminal.
    const p = ps.abrirShell('raiz', tmpdir())
    ps.parar(p.id)
    // Esquecer ANTES de o processo terminar — era aqui que a aba ficava presa.
    ps.esquecer(p.id)
    for (let i = 0; i < 300 && ps.listar().some(x => x.id === p.id); i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(ps.listar().some(x => x.id === p.id)).toBe(false)
  }, 30_000)
})

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
