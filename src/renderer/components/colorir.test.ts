import { describe, it, expect } from 'vitest'
import { colorir, LIMITE_COLORIR } from './colorir'

/** Só os pedaços com cor, como "tipo:texto", para o teste ler fácil. */
const cores = (texto: string, ext: string): string[] =>
  colorir(texto, ext).filter(p => p.t).map(p => `${p.t}:${p.s}`)

describe('colorir código', () => {
  it('junta os pedaços de volta no texto original, sem perder nada', () => {
    const t = 'const a = "x" // oi\nfunction f(b) { return b + 1 }\n'
    expect(colorir(t, 'ts').map(p => p.s).join('')).toBe(t)
  })

  it('palavra-chave, texto, número, comentário e chamada de função', () => {
    expect(cores('const a = f("x", 2) // fim', 'ts')).toEqual([
      'chave:const', 'fun:f', 'str:"x"', 'num:2', 'com:// fim'
    ])
  })

  it('constantes e tipos com maiúscula', () => {
    expect(cores('let x: Pessoa = null', 'ts')).toEqual(['chave:let', 'tipo:Pessoa', 'const:null'])
  })

  it('tags de JSX e HTML, mas não um "menor que"', () => {
    expect(cores('<div>{a<b}</div>', 'tsx')).toEqual(['tag:<div', 'tag:</div'])
  })

  it('comentário de cerquilha em Python, e # não é comentário em TS', () => {
    expect(cores('def f(): # nada', 'py')).toEqual(['chave:def', 'fun:f', 'com:# nada'])
    expect(cores('a.#b', 'ts')).toEqual([])
  })

  it('comentário de bloco atravessa linhas', () => {
    expect(cores('/* a\nb */ x', 'css')).toEqual(['com:/* a\nb */'])
  })

  it('chave de JSON vira propriedade, valor continua texto', () => {
    expect(cores('{ "nome": "cortex", "n": 1 }', 'json')).toEqual([
      'prop:"nome"', 'str:"cortex"', 'prop:"n"', 'num:1'
    ])
  })

  it('texto puro (md, txt) e arquivo grande demais não ganham cor', () => {
    expect(cores('const x = 1', 'md')).toEqual([])
    const grande = 'const x = 1\n'.repeat(Math.ceil(LIMITE_COLORIR / 12) + 1)
    expect(colorir(grande, 'ts')).toEqual([{ t: null, s: grande }])
  })
})
