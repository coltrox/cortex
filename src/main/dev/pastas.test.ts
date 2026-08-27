import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PastasDev, ehTexto } from './pastas'

let base: string, proj: string, fora: string

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'cortex-dev-'))
  proj = join(base, 'projeto')
  fora = join(base, 'segredos')
  await mkdir(join(proj, 'src'), { recursive: true })
  await mkdir(join(proj, 'node_modules', 'react'), { recursive: true })
  await mkdir(fora, { recursive: true })
  await writeFile(join(proj, 'src', 'app.ts'), 'export const x = 1\n', 'utf8')
  await writeFile(join(proj, 'README.md'), '# projeto\n', 'utf8')
  await writeFile(join(proj, 'logo.png'), 'binario', 'utf8')
  await writeFile(join(fora, 'senhas.txt'), 'nao deveria ser lido', 'utf8')
})
afterEach(async () => { await rm(base, { recursive: true, force: true }) })

const autorizado = (): PastasDev => new PastasDev(() => [proj])

describe('PastasDev — confinamento', () => {
  it('recusa uma raiz que nao esta na lista autorizada', () => {
    expect(() => autorizado().resolver(fora, '')).toThrow(/nao autorizada|não autorizada/)
  })

  it('recusa subir de nivel com .. mesmo partindo de raiz autorizada', () => {
    const p = autorizado()
    expect(() => p.resolver(proj, '../segredos/senhas.txt')).toThrow(/fora da pasta/)
  })

  it('recusa caminho absoluto no lugar do relativo', () => {
    const p = autorizado()
    expect(() => p.resolver(proj, join(fora, 'senhas.txt'))).toThrow(/fora da pasta/)
  })

  it('nao aceita pasta irma cujo nome comeca igual ao da autorizada', async () => {
    const irma = `${proj}-outro`
    await mkdir(irma, { recursive: true })
    expect(() => autorizado().resolver(irma, '')).toThrow(/autorizada/)
  })

  it('aceita a propria raiz e um filho legitimo', () => {
    const p = autorizado()
    expect(p.resolver(proj, '')).toBe(resolve(proj))
    expect(p.resolver(proj, 'src/app.ts')).toBe(resolve(proj, 'src', 'app.ts'))
  })

  it('enxerga uma pasta autorizada depois da construcao', () => {
    // A lista e uma funcao justamente para isso: autorizar uma pasta nova nao
    // pode exigir reiniciar o app.
    const lista: string[] = []
    const p = new PastasDev(() => lista)
    expect(() => p.resolver(proj, '')).toThrow(/autorizada/)
    lista.push(proj)
    expect(p.resolver(proj, '')).toBe(resolve(proj))
  })
})

describe('PastasDev — leitura', () => {
  it('lista pastas antes de arquivos e esconde node_modules', async () => {
    const itens = await autorizado().listar(proj, '')
    // Ordem alfabetica de verdade (localeCompare pt-BR): 'logo' vem antes de
    // 'README' porque a comparacao nao e por codigo de caractere.
    expect(itens.map(i => i.nome)).toEqual(['src', 'logo.png', 'README.md'])
  })

  it('marca binario como nao editavel', async () => {
    const itens = await autorizado().listar(proj, '')
    const png = itens.find(i => i.nome === 'logo.png')
    const md = itens.find(i => i.nome === 'README.md')
    expect(png?.editavel).toBe(false)
    expect(md?.editavel).toBe(true)
  })

  it('devolve rel em POSIX', async () => {
    const itens = await autorizado().listar(proj, 'src')
    expect(itens[0].rel).toBe('src/app.ts')
  })

  it('le um arquivo de texto', async () => {
    expect(await autorizado().ler(proj, 'src/app.ts')).toBe('export const x = 1\n')
  })

  it('recusa ler binario', async () => {
    await expect(autorizado().ler(proj, 'logo.png')).rejects.toThrow(/binario|binário/)
  })

  it('recusa ler de fora da raiz autorizada', async () => {
    await expect(autorizado().ler(proj, '../segredos/senhas.txt')).rejects.toThrow(/fora da pasta/)
  })
})

describe('PastasDev — escrita', () => {
  it('grava e le de volta', async () => {
    const p = autorizado()
    await p.gravar(proj, 'src/app.ts', 'export const x = 2\n')
    expect(await p.ler(proj, 'src/app.ts')).toBe('export const x = 2\n')
  })

  it('cria o arquivo e as pastas que faltam', async () => {
    const p = autorizado()
    await p.gravar(proj, 'src/novo/arquivo.ts', 'oi')
    expect(await p.ler(proj, 'src/novo/arquivo.ts')).toBe('oi')
  })

  it('nao deixa .tmp para tras', async () => {
    const p = autorizado()
    await p.gravar(proj, 'README.md', '# novo')
    const itens = await p.listar(proj, '')
    expect(itens.some(i => i.nome.endsWith('.tmp'))).toBe(false)
  })

  it('recusa gravar fora da raiz autorizada', async () => {
    await expect(autorizado().gravar(proj, '../segredos/senhas.txt', 'x'))
      .rejects.toThrow(/fora da pasta/)
  })
})

describe('ehTexto', () => {
  it('reconhece extensoes de codigo e recusa binarios', () => {
    expect(ehTexto('a.ts')).toBe(true)
    expect(ehTexto('a.PY')).toBe(true)
    expect(ehTexto('.gitignore')).toBe(true)
    expect(ehTexto('a.png')).toBe(false)
    expect(ehTexto('Makefile')).toBe(false)
  })
})
