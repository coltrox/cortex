import { describe, it, expect } from 'vitest'
import { rotuloData, tituloCurto, acharPorNome, daquiPraFrente } from './rotulos'

describe('rotuloData', () => {
  it('monta dia da semana e data curta', () => {
    expect(rotuloData('2026-10-19')).toBe('SEG, 19/10')
    expect(rotuloData('2026-11-15')).toBe('DOM, 15/11')
  })

  it('o dia da semana vem da DATA, nao do titulo', () => {
    // 21/10/2026 e quarta. Se o cronograma for remarcado e o titulo continuar
    // dizendo "seg", o cartao ainda mostra o dia certo.
    expect(rotuloData('2026-10-21').startsWith('QUA')).toBe(true)
  })

  it('data vazia ou torta nao vira NaN na tela', () => {
    expect(rotuloData('')).toBe('')
    expect(rotuloData('amanha')).toBe('')
    expect(rotuloData('19/10/2026')).toBe('')
    expect(rotuloData(undefined as unknown as string)).toBe('')
  })
})

describe('tituloCurto', () => {
  it('tira o prefixo de data que a linha de cima ja mostra', () => {
    expect(tituloCurto('19/10 seg — Matemática: razão, proporção e %'))
      .toBe('Matemática: razão, proporção e %')
  })

  it('funciona com os tres tipos de traco', () => {
    expect(tituloCurto('20/10 ter – Linguagens')).toBe('Linguagens')
    expect(tituloCurto('20/10 ter - Linguagens')).toBe('Linguagens')
    expect(tituloCurto('20/10 ter — Linguagens')).toBe('Linguagens')
  })

  it('titulo sem o padrao fica intacto', () => {
    // Cortar por aproximacao comeria o comeco de uma nota qualquer.
    expect(tituloCurto('Trigonometria — círculo, seno e cosseno'))
      .toBe('Trigonometria — círculo, seno e cosseno')
    expect(tituloCurto('Flashcards - Matemática')).toBe('Flashcards - Matemática')
    expect(tituloCurto('Redação 19/10')).toBe('Redação 19/10')
  })

  it('titulo que e so o prefixo nao fica vazio', () => {
    expect(tituloCurto('08/11 dom — ')).toBe('08/11 dom —')
  })

  it('aguenta nome vazio', () => {
    expect(tituloCurto('')).toBe('')
    expect(tituloCurto(undefined as unknown as string)).toBe('')
  })
})

describe('acharPorNome', () => {
  const itens = [
    { nome: 'Frases e conectivos' },
    { nome: 'Física — Energia, trabalho e potência' },
    { nome: 'Fisica - Formulario Unicamp' }
  ]

  it('acha pelo nome exato', () => {
    expect(acharPorNome(itens, 'Frases e conectivos')?.nome).toBe('Frases e conectivos')
  })

  it('ignora acento e caixa', () => {
    expect(acharPorNome(itens, 'FRASES E CONECTIVOS')?.nome).toBe('Frases e conectivos')
    expect(acharPorNome(itens, 'fisica - formulario unicamp')?.nome)
      .toBe('Fisica - Formulario Unicamp')
  })

  it('travessao e hifen sao o mesmo traco', () => {
    // O titulo usa travessao; o link pode ter sido escrito com hifen.
    expect(acharPorNome(itens, 'Fisica - Energia, trabalho e potencia')?.nome)
      .toBe('Física — Energia, trabalho e potência')
  })

  it('link que cita so o comeco do titulo ainda acha', () => {
    expect(acharPorNome(itens, 'Fisica - Formulario')?.nome).toBe('Fisica - Formulario Unicamp')
  })

  it('nome que nao existe devolve nada, em vez de abrir a errada', () => {
    expect(acharPorNome(itens, 'Astronomia aplicada')).toBeUndefined()
    expect(acharPorNome(itens, '')).toBeUndefined()
  })
})

describe('daquiPraFrente', () => {
  const d = (data: string) => ({ data })
  const dt = (i: { data: string }) => i.data
  const HOJE = '2026-10-20'

  it('hoje vem primeiro, e nao no fim', () => {
    // O bug que ele viu no celular: a folha de 14/11 abria a lista e a de
    // hoje ficava la embaixo.
    const r = daquiPraFrente([d('2026-11-14'), d('2026-10-20'), d('2026-11-02')], HOJE, dt)
    expect(r.map(dt)).toEqual(['2026-10-20', '2026-11-02', '2026-11-14'])
  })

  it('o passado desce depois, do mais recente ao mais antigo', () => {
    const r = daquiPraFrente([d('2026-10-10'), d('2026-10-25'), d('2026-10-18')], HOJE, dt)
    expect(r.map(dt)).toEqual(['2026-10-25', '2026-10-18', '2026-10-10'])
  })

  it('item sem data vai para o fim e nao some', () => {
    const r = daquiPraFrente([d(''), d('2026-10-25')], HOJE, dt)
    expect(r).toHaveLength(2)
    expect(dt(r[0])).toBe('2026-10-25')
  })

  it('lista vazia nao quebra', () => {
    expect(daquiPraFrente([], HOJE, dt)).toEqual([])
  })
})
