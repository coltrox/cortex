import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Recebidos } from './recebidos'

let dir: string, arq: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cortex-rec-'))
  arq = join(dir, 'recebidos.json')
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
})
