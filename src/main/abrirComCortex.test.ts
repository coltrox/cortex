import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { arquivoDosArgumentos, pastaEArquivo } from './abrirComCortex'

/** Finge um disco: só os caminhos desta lista existem. */
const disco = (...caminhos: string[]) => (c: string): boolean =>
  caminhos.map(x => resolve(x)).includes(c)

describe('o arquivo que o Windows mandou abrir', () => {
  it('empacotado: pega o caminho depois do executavel', () => {
    const argv = ['C:\\Programs\\Cortex\\Cortex.exe', 'C:\\Users\\PH\\notas.md']
    expect(arquivoDosArgumentos(argv, true, disco('C:\\Users\\PH\\notas.md')))
      .toBe(resolve('C:\\Users\\PH\\notas.md'))
  })

  it('ignora as flags do Chromium', () => {
    const argv = ['Cortex.exe', '--allow-file-access-from-files', '--no-sandbox', 'C:\\a\\b.txt']
    expect(arquivoDosArgumentos(argv, true, disco('C:\\a\\b.txt'))).toBe(resolve('C:\\a\\b.txt'))
  })

  it('em desenvolvimento, o script do app nao conta como arquivo aberto', () => {
    const argv = ['electron.exe', 'out/main/index.js', 'C:\\a\\b.txt']
    expect(arquivoDosArgumentos(argv, false, disco('out/main/index.js', 'C:\\a\\b.txt')))
      .toBe(resolve('C:\\a\\b.txt'))
  })

  it('sem arquivo nenhum, devolve null', () => {
    expect(arquivoDosArgumentos(['Cortex.exe'], true, disco())).toBeNull()
    expect(arquivoDosArgumentos(['Cortex.exe', '.'], true, disco('.'))).toBeNull()
    // Caminho que nao existe mais (atalho velho) nao vira arquivo aberto.
    expect(arquivoDosArgumentos(['Cortex.exe', 'C:\\sumiu.md'], true, disco())).toBeNull()
  })
})

describe('a pasta e o nome do arquivo', () => {
  it('separa a pasta do nome', () => {
    const r = pastaEArquivo(resolve('C:\\Users\\PH\\Documentos\\lista.md'))
    expect(r.pasta).toBe(resolve('C:\\Users\\PH\\Documentos'))
    expect(r.nome).toBe('lista.md')
  })
})
