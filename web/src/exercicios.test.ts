import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  cartasDoCardapio, materiasDo, filtrarPorMateria, peso, baralho, registrar,
  placarDoDia, pendentes, lerHistorico, gravarHistorico, type Historico
} from './exercicios'

const q = (n: number, materia: string) => ({
  n, materia,
  enunciado: `Questao ${n}`,
  a: 'um', b: 'dois', c: 'tres', d: 'quatro', e: 'cinco',
  gabarito: 'b',
  comentario: 'porque dois'
})

const itens = [
  {
    especie: 'materia', nome: 'Trigonometria',
    detalhe: { materia: 'Matemática', questoes: [q(1, 'trigonometria'), q(2, 'trigonometria')] }
  },
  {
    especie: 'plano-dia', nome: '26/10 seg',
    detalhe: { data: '2026-10-26', questoes: [q(1, 'física')] }
  },
  // Sem questoes: entra no cardapio, mas nao no baralho.
  { especie: 'materia', nome: 'Historia', detalhe: { materia: 'História' } },
  // Espécie que nao carrega exercicio nenhum.
  { especie: 'treino', nome: 'Peito', detalhe: {} }
] as never[]

describe('cartasDoCardapio', () => {
  it('junta as questoes de conteudos e de dias do cronograma', () => {
    const cartas = cartasDoCardapio(itens)
    expect(cartas).toHaveLength(3)
    expect(cartas.map(c => c.chave))
      .toEqual(['Trigonometria#1', 'Trigonometria#2', '26/10 seg#1'])
  })

  it('a chave junta nota e numero, para duas notas poderem ter a questao 1', () => {
    const cartas = cartasDoCardapio(itens)
    expect(new Set(cartas.map(c => c.chave)).size).toBe(3)
  })

  it('guarda de onde a questao veio', () => {
    expect(cartasDoCardapio(itens)[2].origem).toBe('26/10 seg')
  })

  it('usa a materia da questao e, na falta dela, a da nota', () => {
    const semMateriaNaQuestao = [{
      especie: 'materia', nome: 'Quimica',
      detalhe: { materia: 'Química', questoes: [{ ...q(1, ''), materia: undefined }] }
    }] as never[]
    expect(cartasDoCardapio(semMateriaNaQuestao)[0].materia).toBe('Química')
  })

  it('descarta questao que nao da para responder', () => {
    const tortas = [{
      especie: 'materia', nome: 'Torta',
      detalhe: {
        questoes: [
          { n: 1, enunciado: 'sem gabarito', a: 'x', b: 'y' },
          { n: 2, gabarito: 'a', a: 'x', b: 'y' },
          { n: 3, enunciado: 'uma alternativa so', a: 'x', gabarito: 'a' },
          q(4, 'ok')
        ]
      }
    }] as never[]
    const cartas = cartasDoCardapio(tortas)
    expect(cartas).toHaveLength(1)
    expect(cartas[0].chave).toBe('Torta#4')
  })

  it('cardapio sem nada devolve baralho vazio, e nao quebra', () => {
    expect(cartasDoCardapio([])).toEqual([])
    const lixo = [{ especie: 'materia', nome: 'X', detalhe: { questoes: 'nao e lista' } }] as never[]
    expect(cartasDoCardapio(lixo)).toEqual([])
  })
})

describe('materias', () => {
  it('lista sem repetir e em ordem', () => {
    expect(materiasDo(cartasDoCardapio(itens))).toEqual(['física', 'trigonometria'])
  })

  it('filtra por materia, e sem filtro devolve tudo', () => {
    const cartas = cartasDoCardapio(itens)
    expect(filtrarPorMateria(cartas, 'física')).toHaveLength(1)
    expect(filtrarPorMateria(cartas, null)).toHaveLength(3)
  })
})

describe('peso e baralho', () => {
  const cartas = cartasDoCardapio(itens)

  it('carta nunca vista vem antes de qualquer outra', () => {
    const h: Historico = {
      'Trigonometria#1': { acertos: 0, erros: 5, visto: '2026-10-19' }
    }
    expect(peso(cartas[1], h)).toBeGreaterThan(peso(cartas[0], h))
  })

  it('entre as vistas, a que ele erra mais vem primeiro', () => {
    const h: Historico = {
      'Trigonometria#1': { acertos: 0, erros: 3, visto: '2026-10-19' },
      'Trigonometria#2': { acertos: 3, erros: 0, visto: '2026-10-19' }
    }
    expect(peso(cartas[0], h)).toBeGreaterThan(peso(cartas[1], h))
  })

  it('carta muito acertada NAO sai do baralho', () => {
    // Ele disse que quer repetir: acertar dez vezes empurra para o fim, nunca
    // para fora.
    const h: Historico = {
      'Trigonometria#1': { acertos: 10, erros: 0, visto: '2026-10-19' },
      'Trigonometria#2': { acertos: 10, erros: 0, visto: '2026-10-19' },
      '26/10 seg#1': { acertos: 10, erros: 0, visto: '2026-10-19' }
    }
    expect(baralho(cartas, h, () => 0.5)).toHaveLength(3)
  })

  it('o baralho nao perde nem duplica carta', () => {
    const r = baralho(cartas, {}, () => 0.5)
    expect(r).toHaveLength(3)
    expect(new Set(r.map(c => c.chave)).size).toBe(3)
  })

  it('a ordem respeita o peso, com o sorteio desempatando', () => {
    const h: Historico = {
      'Trigonometria#1': { acertos: 5, erros: 0, visto: '2026-10-19' },
      'Trigonometria#2': { acertos: 0, erros: 5, visto: '2026-10-19' }
    }
    // '26/10 seg#1' nunca foi vista: vem primeiro. Depois a errada, por fim a
    // acertada.
    expect(baralho(cartas, h, () => 0).map(c => c.chave))
      .toEqual(['26/10 seg#1', 'Trigonometria#2', 'Trigonometria#1'])
  })
})

describe('registrar', () => {
  it('conta acerto e marca o dia', () => {
    const h = registrar({}, 'Trigonometria#1', true, '2026-10-19')
    expect(h['Trigonometria#1']).toEqual({ acertos: 1, erros: 0, visto: '2026-10-19' })
  })

  it('soma na carta que ja existia, sem apagar o resto', () => {
    let h = registrar({}, 'a#1', false, '2026-10-19')
    h = registrar(h, 'b#1', true, '2026-10-19')
    h = registrar(h, 'a#1', true, '2026-10-20')
    expect(h['a#1']).toEqual({ acertos: 1, erros: 1, visto: '2026-10-20' })
    expect(h['b#1'].acertos).toBe(1)
  })

  it('nao altera o historico recebido', () => {
    const antes: Historico = {}
    registrar(antes, 'a#1', true, '2026-10-19')
    expect(antes).toEqual({})
  })
})

describe('placarDoDia', () => {
  it('conta so o que foi respondido hoje', () => {
    let h = registrar({}, 'a#1', true, '2026-10-18')
    h = registrar(h, 'b#1', true, '2026-10-19')
    h = registrar(h, 'c#1', false, '2026-10-19')
    expect(placarDoDia(h, '2026-10-19')).toEqual({ certas: 1, erradas: 1 })
  })

  it('dia sem nada respondido da placar zerado', () => {
    expect(placarDoDia({}, '2026-10-19')).toEqual({ certas: 0, erradas: 0 })
  })
})

describe('pendentes', () => {
  const cartas = cartasDoCardapio(itens)

  it('lista o que ele erra mais do que acerta', () => {
    const h: Historico = {
      'Trigonometria#1': { acertos: 0, erros: 2, visto: '2026-10-19' },
      'Trigonometria#2': { acertos: 2, erros: 1, visto: '2026-10-19' }
    }
    expect(pendentes(cartas, h).map(c => c.chave)).toEqual(['Trigonometria#1'])
  })

  it('empate nao conta como pendente', () => {
    const h: Historico = {
      'Trigonometria#1': { acertos: 1, erros: 1, visto: '2026-10-19' }
    }
    expect(pendentes(cartas, h)).toEqual([])
  })

  it('carta nunca vista nao e pendencia', () => {
    expect(pendentes(cartas, {})).toEqual([])
  })
})

describe('persistencia', () => {
  it('grava e le de volta', () => {
    const g = guardadoDeMemoria()
    const h = registrar({}, 'a#1', true, '2026-10-19')
    gravarHistorico(g, h)
    expect(lerHistorico(g)).toEqual(h)
  })

  it('sem nada guardado comeca vazio', () => {
    expect(lerHistorico(guardadoDeMemoria())).toEqual({})
  })

  it('JSON torto nao quebra a tela', () => {
    expect(lerHistorico(guardadoDeMemoria({ 'cortex.treino': '{ nao e json' }))).toEqual({})
    expect(lerHistorico(guardadoDeMemoria({ 'cortex.treino': '[1,2,3]' }))).toEqual({})
  })

  it('campo de tipo errado vira zero em vez de contaminar a conta', () => {
    const g = guardadoDeMemoria({
      'cortex.treino': JSON.stringify({ 'a#1': { acertos: 'muitos', erros: 2 } })
    })
    expect(lerHistorico(g)['a#1']).toEqual({ acertos: 0, erros: 2, visto: '' })
  })
})
