import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Recebidos } from './recebidos'

// Controle do mock de 'node:fs/promises' abaixo. `vi.hoisted` porque a
// fábrica de `vi.mock` é hoisted para o topo do arquivo e rodaria antes de
// qualquer `let` normal ser inicializado.
const estadoMock = vi.hoisted(() => ({ falharRename: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    rename: async (...args: Parameters<typeof real.rename>) => {
      if (estadoMock.falharRename) {
        estadoMock.falharRename = false
        throw new Error('falha simulada de disco')
      }
      return real.rename(...args)
    }
  }
})

let dir: string, arq: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cortex-rec-'))
  arq = join(dir, 'recebidos.json')
  estadoMock.falharRename = false
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('Recebidos', () => {
  it('um id novo ainda nao foi aplicado', async () => {
    const r = new Recebidos(arq)
    await r.carregar()
    expect(r.jaAplicado('abc')).toBe(false)
  })

  it('depois de marcar, reconhece', async () => {
    const r = new Recebidos(arq)
    await r.carregar()
    await r.marcar('abc')
    expect(r.jaAplicado('abc')).toBe(true)
  })

  it('sobrevive a reabrir — e isto que impede o gasto duplicado', async () => {
    const r1 = new Recebidos(arq)
    await r1.carregar()
    await r1.marcar('abc')

    const r2 = new Recebidos(arq)
    await r2.carregar()
    expect(r2.jaAplicado('abc')).toBe(true)
  })

  it('arquivo corrompido nao impede sincronizar', async () => {
    await writeFile(arq, '{ isto nao e json', 'utf8')
    const r = new Recebidos(arq)
    await r.carregar()
    expect(r.jaAplicado('abc')).toBe(false)
    await r.marcar('abc')
    expect(r.jaAplicado('abc')).toBe(true)
  })

  it('poda ids mais velhos que o limite', async () => {
    const antigo = new Date(Date.now() - 100 * 86400000).toISOString()
    await writeFile(arq, JSON.stringify({ velho: antigo, novo: new Date().toISOString() }), 'utf8')
    const r = new Recebidos(arq)
    await r.carregar()
    expect(await r.podar(90)).toBe(1)
    expect(r.jaAplicado('velho')).toBe(false)
    expect(r.jaAplicado('novo')).toBe(true)
  })

  it('poda preserva id com data ilegivel, mesmo velho — perder marca custa mais que guardar lixo', async () => {
    await writeFile(
      arq,
      JSON.stringify({ ilegivel: 'nao-e-uma-data', novo: new Date().toISOString() }),
      'utf8'
    )
    const r = new Recebidos(arq)
    await r.carregar()
    expect(await r.podar(90)).toBe(0)
    expect(r.jaAplicado('ilegivel')).toBe(true)
    expect(r.jaAplicado('novo')).toBe(true)
  })

  it('grava atomicamente: nao sobra arquivo temporario no diretorio', async () => {
    const r = new Recebidos(arq)
    await r.carregar()
    await r.marcar('abc')
    const arquivos = await readdir(dir)
    expect(arquivos).toEqual(['recebidos.json'])
  })

  it('grava atomicamente: uma escrita que falha nao corrompe o arquivo existente', async () => {
    const original = { abc: new Date().toISOString() }
    await writeFile(arq, JSON.stringify(original), 'utf8')

    const r = new Recebidos(arq)
    await r.carregar()

    estadoMock.falharRename = true
    await expect(r.marcar('novo')).rejects.toThrow('falha simulada de disco')

    // O arquivo original — gravado ANTES da tentativa que falhou — continua
    // íntegro e legível: o writeFile foi para o .tmp, só o rename falhou.
    const conteudo = JSON.parse(await readFile(arq, 'utf8'))
    expect(conteudo).toEqual(original)

    // E nao ficou lixo .tmp para trás — a implementação limpa no catch.
    const arquivos = await readdir(dir)
    expect(arquivos).toEqual(['recebidos.json'])
  })

  it('marcacoes concorrentes nao se perdem — sem fila, a ultima gravacao apaga as outras', async () => {
    const r = new Recebidos(arq)
    await r.carregar()

    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`)
    // Sem await entre elas: dispara as 20 e só espera no final. É exatamente
    // o cenário de dois gatilhos de sincronização se sobrepondo.
    await Promise.all(ids.map((id) => r.marcar(id)))

    const r2 = new Recebidos(arq)
    await r2.carregar()
    for (const id of ids) {
      expect(r2.jaAplicado(id)).toBe(true)
    }
  })
})
