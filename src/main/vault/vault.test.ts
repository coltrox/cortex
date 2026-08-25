import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from './vault'

let root: string
let vault: Vault

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('Vault', () => {
  it('lista .md em caminho relativo POSIX, recursivamente', async () => {
    await mkdir(join(root, 'Projetos'), { recursive: true })
    await writeFile(join(root, 'Projetos', 'Nima.md'), '# Nima')
    await writeFile(join(root, 'raiz.md'), 'x')
    const files = await vault.listMarkdown()
    expect(files.sort()).toEqual(['Projetos/Nima.md', 'raiz.md'])
  })

  it('ignora .vault/ e arquivos que não são .md', async () => {
    await mkdir(join(root, '.vault'), { recursive: true })
    await writeFile(join(root, '.vault', 'nota.md'), 'x')
    await writeFile(join(root, 'imagem.png'), 'x')
    expect(await vault.listMarkdown()).toEqual([])
  })

  it('lê e escreve preservando o conteúdo', async () => {
    await vault.writeAtomic('a.md', 'conteúdo com acento')
    expect(await vault.read('a.md')).toBe('conteúdo com acento')
  })

  it('cria diretórios intermediários ao escrever', async () => {
    await vault.writeAtomic('Saúde/Treinos/2026-08-24.md', 'treino')
    expect(await readFile(join(root, 'Saúde', 'Treinos', '2026-08-24.md'), 'utf8')).toBe('treino')
  })

  it('não deixa arquivo temporário para trás', async () => {
    await vault.writeAtomic('a.md', 'x')
    expect(await vault.listMarkdown()).toEqual(['a.md'])
  })

  it('recusa path traversal com ..', () => {
    expect(() => vault.toAbsolute('../fora.md')).toThrow('caminho fora do vault')
    expect(() => vault.toAbsolute('Projetos/../../fora.md')).toThrow('caminho fora do vault')
  })

  it('recusa caminho absoluto', () => {
    expect(() => vault.toAbsolute('C:/Windows/system32/x.md')).toThrow('caminho fora do vault')
  })

  it('devolve mtime e size', async () => {
    await vault.writeAtomic('a.md', 'abc')
    const s = await vault.stat('a.md')
    expect(s.size).toBe(3)
    expect(s.mtimeMs).toBeGreaterThan(0)
  })
})
