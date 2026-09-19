import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PastasDev, ehTexto, nomeLivre, tipoDeMidia } from './pastas'

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

describe('PastasDev — copiar o que foi arrastado do Explorer', () => {
  it('copia um arquivo de fora para dentro da pasta escolhida', async () => {
    const rel = await autorizado().copiarPara(proj, 'src', join(fora, 'senhas.txt'))
    expect(rel).toBe('src/senhas.txt')
    expect(await autorizado().ler(proj, 'src/senhas.txt')).toBe('nao deveria ser lido')
  })

  it('não sobrescreve: um nome que já existe ganha (2), (3)…', async () => {
    await writeFile(join(fora, 'app.ts'), 'novo', 'utf8')
    expect(await autorizado().copiarPara(proj, 'src', join(fora, 'app.ts'))).toBe('src/app (2).ts')
    expect(await autorizado().copiarPara(proj, 'src', join(fora, 'app.ts'))).toBe('src/app (3).ts')
    expect(await autorizado().ler(proj, 'src/app.ts')).toBe('export const x = 1\n')
  })

  it('copia uma pasta inteira', async () => {
    const rel = await autorizado().copiarPara(proj, '', fora)
    expect(rel).toBe('segredos')
    expect(await autorizado().ler(proj, 'segredos/senhas.txt')).toBe('nao deveria ser lido')
  })

  it('recusa destino fora da pasta autorizada', async () => {
    await expect(autorizado().copiarPara(proj, '../segredos', join(proj, 'README.md'))).rejects.toThrow(/fora/)
    await expect(new PastasDev(() => [proj]).copiarPara(fora, '', join(proj, 'README.md'))).rejects.toThrow(/autorizada/)
  })

  it('recusa copiar uma pasta para dentro dela mesma', async () => {
    await expect(new PastasDev(() => [base]).copiarPara(base, 'projeto/src', proj)).rejects.toThrow(/dentro dela mesma/)
  })

  it('recusa destino que não é pasta e origem que não existe', async () => {
    await expect(autorizado().copiarPara(proj, 'README.md', join(fora, 'senhas.txt'))).rejects.toThrow(/não é uma pasta/)
    await expect(autorizado().copiarPara(proj, 'src', join(fora, 'nada.txt'))).rejects.toThrow(/não existe/)
  })
})

describe('nome livre para a cópia', () => {
  it('mantém a extensão e numera antes dela', () => {
    expect(nomeLivre('a.ts', new Set())).toBe('a.ts')
    expect(nomeLivre('a.ts', new Set(['a.ts']))).toBe('a (2).ts')
    expect(nomeLivre('.env', new Set(['.env']))).toBe('.env (2)')
    expect(nomeLivre('pasta', new Set(['pasta', 'pasta (2)']))).toBe('pasta (3)')
  })
})

describe('PastasDev — mover, renomear, excluir e ver mídia', () => {
  it('move um arquivo para outra pasta e devolve o caminho novo', async () => {
    expect(await autorizado().mover(proj, 'README.md', 'src')).toBe('src/README.md')
    expect(await autorizado().ler(proj, 'src/README.md')).toBe('# projeto\n')
    await expect(autorizado().ler(proj, 'README.md')).rejects.toThrow()
  })

  it('mover para onde já tem um igual ganha (2), e para a mesma pasta não faz nada', async () => {
    await writeFile(join(proj, 'src', 'README.md'), 'outro', 'utf8')
    expect(await autorizado().mover(proj, 'README.md', 'src')).toBe('src/README (2).md')
    expect(await autorizado().mover(proj, 'src/app.ts', 'src')).toBe('src/app.ts')
  })

  it('não move uma pasta para dentro dela mesma, nem a raiz', async () => {
    await mkdir(join(proj, 'src', 'lib'))
    await expect(autorizado().mover(proj, 'src', 'src/lib')).rejects.toThrow(/dentro dela mesma/)
    await expect(autorizado().mover(proj, '', 'src')).rejects.toThrow(/raiz/)
  })

  it('renomeia, e recusa nome inválido ou que já existe', async () => {
    expect(await autorizado().renomear(proj, 'src/app.ts', 'main.ts')).toBe('src/main.ts')
    await expect(autorizado().renomear(proj, 'README.md', 'src')).rejects.toThrow(/já existe/)
    await expect(autorizado().renomear(proj, 'README.md', '../fora.md')).rejects.toThrow(/nome inválido/)
    await expect(autorizado().renomear(proj, 'README.md', 'a:b')).rejects.toThrow(/nome inválido/)
  })

  it('o caminho de um item para a Lixeira nunca é a raiz nem sai dela', () => {
    expect(autorizado().item(proj, 'src/app.ts')).toBe(join(resolve(proj), 'src', 'app.ts'))
    expect(() => autorizado().item(proj, '')).toThrow(/raiz/)
    expect(() => autorizado().item(proj, '../segredos')).toThrow(/fora/)
  })

  it('lê foto e PDF como base64 com o tipo certo, e recusa o resto', async () => {
    await writeFile(join(proj, 'foto.PNG'), Buffer.from([1, 2, 3]))
    await writeFile(join(proj, 'doc.pdf'), '%PDF-1.4')
    expect(await autorizado().lerMidia(proj, 'foto.PNG')).toEqual({ tipo: 'image/png', base64: 'AQID' })
    expect((await autorizado().lerMidia(proj, 'doc.pdf')).tipo).toBe('application/pdf')
    await expect(autorizado().lerMidia(proj, 'README.md')).rejects.toThrow(/não é foto nem PDF/)
  })

  it('reconhece as extensões de mídia', () => {
    expect(tipoDeMidia('a.jpg')).toBe('image/jpeg')
    expect(tipoDeMidia('a.webp')).toBe('image/webp')
    expect(tipoDeMidia('a.pdf')).toBe('application/pdf')
    expect(tipoDeMidia('a.svg')).toBeNull()
    expect(tipoDeMidia('a.zip')).toBeNull()
  })
})

describe('PastasDev — pasta que ainda não existe', () => {
  it('lista vazio em vez de erro (o projeto novo ainda está sendo criado)', async () => {
    expect(await autorizado().listar(proj, 'ainda-nao-existe')).toEqual([])
  })

  it('continua recusando o que sai da pasta autorizada', async () => {
    await expect(autorizado().listar(proj, '../segredos')).rejects.toThrow(/fora/)
  })
})
