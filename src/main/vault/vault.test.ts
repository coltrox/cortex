import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
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

  it('não deixa arquivo temporário no diretório após escrita bem-sucedida', async () => {
    await vault.writeAtomic('a.md', 'x')
    expect(await readdir(root)).toEqual(['a.md'])
  })

  it('limpa o temporário quando o rename falha', async () => {
    // Força uma falha de rename real: o destino é um diretório não vazio,
    // então renomear um arquivo por cima dele deve rejeitar.
    await mkdir(join(root, 'b.md'), { recursive: true })
    await writeFile(join(root, 'b.md', 'dentro.txt'), 'y')

    await expect(vault.writeAtomic('b.md', 'x')).rejects.toThrow()

    const entries = await readdir(root)
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false)
  })

  it('escritas concorrentes no mesmo caminho não produzem conteúdo híbrido', async () => {
    const a = 'AAAAAAAAAA-content-from-write-A-longer-string-here'
    const b = 'B-short'

    await Promise.all([vault.writeAtomic('c.md', a), vault.writeAtomic('c.md', b)])

    const final = await vault.read('c.md')
    expect([a, b]).toContain(final)
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
