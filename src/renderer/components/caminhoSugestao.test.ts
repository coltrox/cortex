import { describe, it, expect } from 'vitest'
import { trechoDeCaminho, filtrarSugestoes, aplicarSugestao, resolverRelativo } from './caminhoSugestao'

describe('o caminho debaixo do cursor', () => {
  const t = (linha: string) => trechoDeCaminho(linha, linha.length)

  it('acha o ./ recem-digitado', () => {
    expect(t("import x from './")).toMatchObject({ texto: './', pasta: './', parcial: '' })
  })

  it('separa a pasta ja fechada do que esta sendo digitado', () => {
    expect(t("import x from './src/comp"))
      .toMatchObject({ pasta: './src/', parcial: 'comp', texto: './src/comp' })
  })

  it('entende o ../ tambem', () => {
    expect(t("require('../shared/"))
      .toMatchObject({ pasta: '../shared/', parcial: '' })
  })

  it('para nas aspas e no espaco', () => {
    const linha = "const a = './um' + './dois"
    expect(trechoDeCaminho(linha, linha.length)?.texto).toBe('./dois')
  })

  it('nao sugere onde nao ha caminho', () => {
    expect(t('const x = 3')).toBeNull()
    expect(t('a média foi 9.5')).toBeNull()
    // Ponto colado numa palavra é chamada de método, não caminho.
    expect(t('this.props./')).toBeNull()
  })

  it('o cursor no meio da linha nao olha o que vem depois', () => {
    const linha = "import './src/a' // e ./outro"
    expect(trechoDeCaminho(linha, 15)?.texto).toBe('./src/a')
  })
})

describe('as sugestoes', () => {
  const nomes = [
    { nome: 'components', pasta: true }, { nome: 'colorir.ts', pasta: false },
    { nome: 'Calendario.tsx', pasta: false }, { nome: 'main.tsx', pasta: false }
  ]

  it('filtra pelo comeco, sem caixa, com pasta na frente', () => {
    expect(filtrarSugestoes(nomes, 'c').map(n => n.nome))
      .toEqual(['components', 'Calendario.tsx', 'colorir.ts'])
  })

  it('parcial vazia devolve tudo, ate o limite', () => {
    expect(filtrarSugestoes(nomes, '', 2)).toHaveLength(2)
  })

  it('nada combina, nada volta', () => {
    expect(filtrarSugestoes(nomes, 'zzz')).toEqual([])
  })
})

describe('escolher uma sugestao', () => {
  it('pasta entra com barra, para continuar de dentro dela', () => {
    const linha = "import x from './comp"
    const trecho = trechoDeCaminho(linha, linha.length)!
    const r = aplicarSugestao(linha, trecho, { nome: 'components', pasta: true })
    expect(r.texto).toBe("import x from './components/")
    expect(r.cursor).toBe(r.texto.length)
  })

  it('arquivo entra sem barra, e o resto da linha fica', () => {
    const linha = "import x from './col'"
    const trecho = trechoDeCaminho(linha, linha.length - 1)!
    const r = aplicarSugestao(linha, trecho, { nome: 'colorir.ts', pasta: false })
    expect(r.texto).toBe("import x from './colorir.ts'")
  })
})

describe('para que pasta o trecho aponta', () => {
  it('o ponto-barra e a pasta do proprio arquivo', () => {
    expect(resolverRelativo('src/renderer/components', './')).toBe('src/renderer/components')
  })

  it('o ponto-ponto sobe um nivel', () => {
    expect(resolverRelativo('src/renderer/components', '../')).toBe('src/renderer')
    expect(resolverRelativo('src/renderer/components', '../../shared/')).toBe('src/shared')
  })

  it('subir demais para na raiz', () => {
    expect(resolverRelativo('src', '../../../')).toBe('')
  })

  it('arquivo na raiz com ./ fica na raiz', () => {
    expect(resolverRelativo('', './')).toBe('')
  })
})
