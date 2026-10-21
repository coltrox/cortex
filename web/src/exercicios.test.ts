import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  cartasDoCardapio, materiasDo, filtrarPorMateria, peso, baralho, registrar,
  paraTreinar, desfazer, feitas, reservadosPeloCronograma,
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

describe('o pote da carta: treino ou cronograma', () => {
  it('questao de dia que AINDA VAI CHEGAR fica fora do treino', () => {
    /* Pedido dele: "quero que eles nao envolvam os exercicios que faria
       posteriormente de acordo com o cronograma". Treinar hoje o que esta
       reservado para o dia 26 estraga o dia 26. */
    const cartas = cartasDoCardapio(itens, '2026-10-20')
    const doDia = cartas.find(c => c.chave === '26/10 seg#1')
    expect(doDia?.pote).toBe('cronograma')
    expect(paraTreinar(cartas).map(c => c.chave))
      .toEqual(['Trigonometria#1', 'Trigonometria#2'])
  })

  it('dia que JA PASSOU tambem NAO volta para o treino', () => {
    /* "Exercicio de cronograma e para ser feito de acordo com os meus
       estudos do cronograma." A questao do dia 26 continua sendo do dia 26
       depois que ele passa: para refazer, abre-se o dia ou escolhe-se a
       questao em "Meus exercicios" — mas ela nao cai por sorteio no treino. */
    const cartas = cartasDoCardapio(itens, '2026-10-27')
    expect(cartas.find(c => c.chave === '26/10 seg#1')?.pote).toBe('cronograma')
    expect(paraTreinar(cartas)).toHaveLength(2)
  })

  it('o dia de HOJE ainda e reserva: ele vai fazer no bloco da noite', () => {
    const cartas = cartasDoCardapio(itens, '2026-10-26')
    expect(cartas.find(c => c.chave === '26/10 seg#1')?.pote).toBe('cronograma')
  })

  it('conteudo nunca e reserva, seja qual for o dia', () => {
    const cartas = cartasDoCardapio(itens, '2026-10-20')
    expect(cartas.filter(c => c.origem === 'Trigonometria').every(c => c.pote === 'treino'))
      .toBe(true)
  })

  it('sem saber que dia e hoje, o DIA continua sendo do cronograma', () => {
    /* Quem chama sem data quer a lista inteira — e ainda assim precisa saber
       de onde cada questao veio, senao a lista "Meus exercicios" perderia a
       marca "do cronograma". */
    const cartas = cartasDoCardapio(itens)
    expect(cartas.find(c => c.chave === '26/10 seg#1')?.pote).toBe('cronograma')
    expect(cartas.filter(c => c.origem === 'Trigonometria').every(c => c.pote === 'treino'))
      .toBe(true)
  })
})

describe('desfazer', () => {
  it('tira o erro que foi dedo torto', () => {
    const h: Historico = { 'a#1': { acertos: 1, erros: 1, visto: '2026-10-20' } }
    expect(desfazer(h, 'a#1', false)['a#1']).toEqual({
      acertos: 1, erros: 0, visto: '2026-10-20'
    })
  })

  it('tira tambem um acerto', () => {
    const h: Historico = { 'a#1': { acertos: 2, erros: 0, visto: '2026-10-20' } }
    expect(desfazer(h, 'a#1', true)['a#1']?.acertos).toBe(1)
  })

  it('zerou tudo: a questao volta a ser NUNCA VISTA', () => {
    /* E nao uma vista com placar zerado, que teria peso bem menor no sorteio
       e sumiria do topo do baralho sem ele nunca a ter respondido. */
    const h: Historico = { 'a#1': { acertos: 0, erros: 1, visto: '2026-10-20' } }
    expect(desfazer(h, 'a#1', false)['a#1']).toBeUndefined()
  })

  it('contestar duas vezes nao inventa credito', () => {
    const h: Historico = { 'a#1': { acertos: 1, erros: 1, visto: '2026-10-20' } }
    const uma = desfazer(h, 'a#1', false)
    const duas = desfazer(uma, 'a#1', false)
    expect(duas['a#1']?.erros).toBe(0)
    expect(duas['a#1']?.acertos).toBe(1)
  })

  it('questao que nunca foi respondida nao muda nada', () => {
    const h: Historico = {}
    expect(desfazer(h, 'nao-existe', true)).toEqual({})
  })
})

describe('feitas', () => {
  const cartas = cartasDoCardapio(itens)
  const h: Historico = {
    'Trigonometria#1': { acertos: 3, erros: 0, visto: '2026-10-19' },
    'Trigonometria#2': { acertos: 1, erros: 2, visto: '2026-10-20' },
    '26/10 seg#1': { acertos: 1, erros: 1, visto: '2026-10-18' }
  }

  it('lista so o que ja foi respondido', () => {
    const f = feitas(cartas, { 'Trigonometria#1': h['Trigonometria#1'] })
    expect(f).toHaveLength(1)
    expect(f[0]?.carta.chave).toBe('Trigonometria#1')
  })

  it('separa acerto de erro', () => {
    const f = feitas(cartas, h)
    const porChave = Object.fromEntries(f.map(x => [x.carta.chave, x.situacao]))
    expect(porChave['Trigonometria#1']).toBe('acertei')
    expect(porChave['Trigonometria#2']).toBe('errei')
  })

  it('empate conta como ERRO: ainda e questao para refazer', () => {
    // Esconder na pilha dos acertos seria dizer que esta resolvida.
    expect(feitas(cartas, h).find(x => x.carta.chave === '26/10 seg#1')?.situacao)
      .toBe('errei')
  })

  it('o mais recente vem primeiro', () => {
    expect(feitas(cartas, h)[0]?.carta.chave).toBe('Trigonometria#2')
  })

  it('historico de questao que sumiu do cardapio nao quebra a lista', () => {
    // A nota pode ter sido apagada no computador depois de respondida.
    expect(feitas(cartas, { 'nota-apagada#9': { acertos: 1, erros: 0, visto: '2026-10-20' } }))
      .toEqual([])
  })
})

describe('reservadosPeloCronograma', () => {
  const comCronograma = [
    {
      especie: 'materia', nome: 'Trigonometria',
      detalhe: { materia: 'Matemática', questoes: [q(1, 'matemática')] }
    },
    {
      especie: 'materia', nome: 'Questões difíceis — Matemática',
      detalhe: { materia: 'Matemática', questoes: [q(1, 'matemática')] }
    },
    {
      especie: 'plano-dia', nome: '26/10 seg',
      detalhe: {
        data: '2026-10-26',
        corpo: 'Noite: trigonometria.\n\n→ [[Trigonometria]]\n',
        questoes: [q(1, 'matemática')]
      }
    },
    {
      especie: 'plano-dia', nome: '18/10 dom',
      detalhe: { data: '2026-10-18', corpo: '→ [[Questões difíceis — Matemática]]' }
    }
  ] as never[]

  it('guarda o conteudo que um dia futuro manda estudar', () => {
    /* O dia 26 aponta a nota de trigonometria. Se os exercicios dela caissem
       no treino de hoje, o dia 26 chegaria com tudo ja respondido. */
    expect([...reservadosPeloCronograma(comCronograma, '2026-10-20')])
      .toEqual(['Trigonometria'])
  })

  it('dia que ja passou nao guarda mais nada', () => {
    expect([...reservadosPeloCronograma(comCronograma, '2026-10-27')]).toEqual([])
  })

  it('a reserva tira a nota inteira do treino livre', () => {
    const cartas = cartasDoCardapio(comCronograma, '2026-10-20')
    const porChave = Object.fromEntries(cartas.map(c => [c.chave, c.pote]))
    expect(porChave['Trigonometria#1']).toBe('cronograma')
    // A de questoes dificeis nao esta reservada por nenhum dia futuro.
    expect(porChave['Questões difíceis — Matemática#1']).toBe('treino')
  })

  it('link com apelido conta pelo nome da nota', () => {
    const itensComApelido = [{
      especie: 'plano-dia', nome: 'amanha',
      detalhe: { data: '2026-10-21', corpo: '→ [[Trigonometria|a nota de trigo]]' }
    }] as never[]
    expect([...reservadosPeloCronograma(itensComApelido, '2026-10-20')])
      .toEqual(['Trigonometria'])
  })

  it('sem hoje, nada fica reservado', () => {
    expect(reservadosPeloCronograma(comCronograma, '').size).toBe(0)
  })
})
