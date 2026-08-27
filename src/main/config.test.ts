import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lerConfig, gravarConfig, normalizarConfig, CONFIG_PADRAO, IDS_AREAS } from './config'

let dir: string, arq: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cortex-cfg-'))
  arq = join(dir, 'config.json')
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('normalizarConfig', () => {
  it('descarta area inventada', () => {
    const c = normalizarConfig({ areas: ['vida', 'nao-existe', 'saude'], pastasDev: [] })
    expect(c.areas).toEqual(['vida', 'saude'])
  })

  it('aceita lista de areas vazia — o usuario pode desligar tudo', () => {
    expect(normalizarConfig({ areas: [], pastasDev: [] }).areas).toEqual([])
  })

  it('cai no padrao quando areas nao e lista', () => {
    expect(normalizarConfig({ areas: 'vida' }).areas).toEqual(IDS_AREAS)
  })

  it('tira pasta repetida e valor que nao e string', () => {
    const c = normalizarConfig({ pastasDev: ['/a', '/a', 42, '', '/b'] })
    expect(c.pastasDev).toEqual(['/a', '/b'])
  })
})

describe('lerConfig', () => {
  it('devolve o padrao quando o arquivo nao existe', async () => {
    expect(await lerConfig(arq)).toEqual(CONFIG_PADRAO)
  })

  it('devolve o padrao quando o JSON esta truncado, sem lancar', async () => {
    // Queda de energia no meio da gravacao nao pode impedir o vault de abrir.
    await writeFile(arq, '{ "areas": ["vida"', 'utf8')
    expect(await lerConfig(arq)).toEqual(CONFIG_PADRAO)
  })

  it('le de volta o que gravou', async () => {
    await gravarConfig(arq, { areas: ['dev'], pastasDev: ['/x'] })
    expect(await lerConfig(arq)).toEqual({ areas: ['dev'], pastasDev: ['/x'] })
  })

  it('grava JSON legivel por humano', async () => {
    await gravarConfig(arq, { areas: ['dev'], pastasDev: [] })
    expect(await readFile(arq, 'utf8')).toContain('\n  "areas"')
  })
})
