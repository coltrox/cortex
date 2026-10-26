import { describe, it, expect } from 'vitest'
import {
  rotuloData, tituloCurto, acharPorNome, daquiPraFrente, ordemDeEstudo,
  proximaAba, separarAtrasadas
} from './rotulos'

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

describe('ordemDeEstudo', () => {
  const r = (data: string, feito = false) => ({ data, feito })
  const dt = (i: { data: string }) => i.data
  const ok = (i: { feito: boolean }) => i.feito
  const HOJE = '2026-10-20'

  it('atrasado e NAO feito vem primeiro de tudo', () => {
    // O caso real: a redacao do dia 19 ficou em branco e aparecia no fim da
    // lista, atras de todas as de novembro.
    const lista = [r('2026-11-14'), r('2026-10-20'), r('2026-10-19')]
    expect(ordemDeEstudo(lista, HOJE, dt, ok).map(dt))
      .toEqual(['2026-10-19', '2026-10-20', '2026-11-14'])
  })

  it('atrasados entre si vao do mais antigo ao mais novo', () => {
    const lista = [r('2026-10-19'), r('2026-10-10'), r('2026-10-15')]
    expect(ordemDeEstudo(lista, HOJE, dt, ok).map(dt))
      .toEqual(['2026-10-10', '2026-10-15', '2026-10-19'])
  })

  it('o que ja foi feito desce, mesmo sendo de hoje', () => {
    const lista = [r('2026-10-20', true), r('2026-11-02')]
    expect(ordemDeEstudo(lista, HOJE, dt, ok).map(dt))
      .toEqual(['2026-11-02', '2026-10-20'])
  })

  it('atrasado JA FEITO nao sobe: ele e historico', () => {
    const lista = [r('2026-10-19', true), r('2026-10-25')]
    expect(ordemDeEstudo(lista, HOJE, dt, ok).map(dt))
      .toEqual(['2026-10-25', '2026-10-19'])
  })

  it('nao perde nem duplica item', () => {
    const lista = [r('2026-10-19'), r('2026-10-20', true), r(''), r('2026-11-01')]
    expect(ordemDeEstudo(lista, HOJE, dt, ok)).toHaveLength(4)
  })
})

describe('proximaAba', () => {
  const abas = ['plano', 'conteudos', 'redacoes'] as const

  it('avanca e volta', () => {
    expect(proximaAba(abas, 'plano', 1)).toBe('conteudos')
    expect(proximaAba(abas, 'redacoes', -1)).toBe('conteudos')
  })

  it('nao da a volta nas pontas', () => {
    // Dar a volta confunde: a pessoa nao sabe se avancou uma ou voltou duas.
    expect(proximaAba(abas, 'plano', -1)).toBe('plano')
    expect(proximaAba(abas, 'redacoes', 1)).toBe('redacoes')
  })

  it('aba desconhecida nao muda nada', () => {
    expect(proximaAba(abas, 'outra' as never, 1)).toBe('outra')
  })
})

describe('separarAtrasadas', () => {
  type R = { nome: string; data: string; pronta: boolean }
  const r = (nome: string, data: string, pronta = false): R => ({ nome, data, pronta })
  const dividir = (itens: R[]) =>
    separarAtrasadas(itens, '2026-10-26', i => i.data, i => i.pronta)

  it('tira da lista o que passou e nao foi feito', () => {
    /* "Coloca como atrasada e nao coloca mais na lista pra aparecer ali."
       Ver quatro cobrancas de dias que nao voltam empurra a de HOJE para
       baixo da dobra. */
    const { lista, atrasadas } = dividir([
      r('ontem', '2026-10-25'), r('hoje', '2026-10-26'), r('amanha', '2026-10-27')
    ])
    expect(lista.map(x => x.nome)).toEqual(['hoje', 'amanha'])
    expect(atrasadas.map(x => x.nome)).toEqual(['ontem'])
  })

  it('feito e feito, mesmo atrasado', () => {
    // Entregue com um dia de atraso nao e pendencia.
    const { lista, atrasadas } = dividir([r('ontem', '2026-10-25', true)])
    expect(lista.map(x => x.nome)).toEqual(['ontem'])
    expect(atrasadas).toEqual([])
  })

  it('o dia de HOJE nunca e atrasado', () => {
    expect(dividir([r('hoje', '2026-10-26')]).atrasadas).toEqual([])
  })

  it('sem data fica na lista', () => {
    // Modelo de redacao, folha sem dia marcado: nao da para atrasar.
    expect(dividir([r('solta', '')]).lista.map(x => x.nome)).toEqual(['solta'])
  })

  it('a ordem original de cada lado e preservada', () => {
    const { lista } = dividir([r('b', '2026-10-27'), r('a', '2026-10-26')])
    expect(lista.map(x => x.nome)).toEqual(['b', 'a'])
  })
})
