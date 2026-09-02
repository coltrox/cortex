import { describe, it, expect } from 'vitest'
import {
  diaLocal, eventoSuplemento, eventoRefeicaoPlano, eventoRefeicaoExtra,
  eventoGasto, eventoSessao, eventoCardio, eventoMedida, eventoPeso, eventoAnotacao,
  eventoProvaEstudada, eventoCompromisso, eventoItemApagado, eventoPorquinho,
  eventoProvaNova, eventoTarefaNova
} from './montar'

const DIA = '2026-08-28'

describe('diaLocal', () => {
  it('formata a data no fuso local', () => {
    expect(diaLocal(new Date(2026, 7, 28, 10, 0))).toBe('2026-08-28')
  })

  it('preenche mês e dia com zero à esquerda', () => {
    expect(diaLocal(new Date(2026, 0, 5, 10, 0))).toBe('2026-01-05')
  })

  it('às 23h30 continua sendo o dia de hoje', () => {
    // O erro que este teste existe para impedir: toISOString() num fuso
    // negativo devolve o dia seguinte à noite, e o registro cairia no diário
    // de amanhã.
    expect(diaLocal(new Date(2026, 7, 28, 23, 30))).toBe('2026-08-28')
  })
})

describe('construtores de evento', () => {
  it('suplemento', () => {
    expect(eventoSuplemento('Creatina', DIA)).toEqual({
      tipo: 'suplemento', dia: DIA, dados: { nome: 'Creatina' }
    })
  })

  it('refeição do plano', () => {
    expect(eventoRefeicaoPlano('Café da manhã', DIA)).toEqual({
      tipo: 'refeicao_plano', dia: DIA, dados: { nome: 'Café da manhã' }
    })
  })

  it('refeição extra, com e sem números', () => {
    expect(eventoRefeicaoExtra('pastel na feira', {}, DIA).dados).toEqual({ item: 'pastel na feira' })
    expect(eventoRefeicaoExtra('whey', { kcal: 120, prot: 24 }, DIA).dados).toEqual({
      item: 'whey', kcal: 120, prot: 24
    })
  })

  it('gasto', () => {
    expect(eventoGasto('almoço', 32.5, { cat: 'comida', dir: 'saida' }, DIA)).toEqual({
      tipo: 'gasto', dia: DIA, dados: { item: 'almoço', valor: 32.5, cat: 'comida', dir: 'saida' }
    })
  })

  it('gasto sem categoria omite o campo em vez de mandar vazio', () => {
    // Campo vazio vira chave vazia no frontmatter do vault, e isso aparece em
    // toda lente que lê a nota.
    expect(eventoGasto('almoço', 32.5, {}, DIA).dados).toEqual({ item: 'almoço', valor: 32.5 })
  })

  it('sessão leva cada série, e um resumo para as lentes do Cortex', () => {
    const e = eventoSessao('Peito e tríceps', [
      { nome: 'Supino reto', feitas: [
        { reps: 10, carga: 60 }, { reps: 8, carga: 65 }, { reps: 6, carga: 65 }
      ] },
      { nome: 'Crucifixo', feitas: [{ reps: 12, carga: 14 }] }
    ], DIA)
    expect(e.tipo).toBe('sessao')
    expect(e.dados.exercicios).toEqual([
      {
        nome: 'Supino reto',
        // Resumo: quantas séries, a faixa de reps que saiu, e a carga mais
        // pesada — que é o número de quem olha evolução.
        series: 3, reps: '6-10', carga: 65,
        feitas: [{ reps: 10, carga: 60 }, { reps: 8, carga: 65 }, { reps: 6, carga: 65 }]
      },
      { nome: 'Crucifixo', series: 1, reps: '12', carga: 14, feitas: [{ reps: 12, carga: 14 }] }
    ])
  })

  it('reps iguais nao viram faixa', () => {
    const e = eventoSessao('T', [
      { nome: 'Rosca', feitas: [{ reps: 12, carga: 10 }, { reps: 12, carga: 10 }] }
    ], DIA)
    expect((e.dados.exercicios as { reps: string }[])[0].reps).toBe('12')
  })

  it('exercicio sem serie preenchida nao entra', () => {
    // E o exercicio que a pessoa pulou: apagar da lista e uma forma de dizer
    // isso, deixar em branco e outra.
    const e = eventoSessao('T', [
      { nome: 'Supino', feitas: [{ reps: 8, carga: 40 }] },
      { nome: 'Crucifixo', feitas: [{}, {}] }
    ], DIA)
    expect(e.dados.exercicios).toHaveLength(1)
  })

  it('serie so com reps, sem peso, vale', () => {
    // Barra fixa e abdominal nao tem peso, e continuam sendo treino.
    const e = eventoSessao('T', [{ nome: 'Barra fixa', feitas: [{ reps: 8 }] }], DIA)
    expect((e.dados.exercicios as { feitas: unknown[]; carga?: number }[])[0])
      .toEqual({ nome: 'Barra fixa', series: 1, reps: '8', feitas: [{ reps: 8 }] })
  })

  it('sessão sem nenhuma série não passa', () => {
    expect(() => eventoSessao('Peito', [{ nome: 'Supino', feitas: [] }], DIA)).toThrow()
    expect(() => eventoSessao('Peito', [{ nome: '  ', feitas: [{ reps: 8 }] }], DIA)).toThrow()
  })

  it('cardio', () => {
    expect(eventoCardio('esteira', 30, { distancia: 5, pace: '6:00', nivel: 8 }, DIA).dados).toEqual({
      aparelho: 'esteira', minutos: 30, distancia: 5, pace: '6:00', nivel: 8
    })
    expect(eventoCardio('bicicleta', 20, {}, DIA).dados).toEqual({ aparelho: 'bicicleta', minutos: 20 })
  })

  it('medida leva só os campos preenchidos', () => {
    expect(eventoMedida({ cintura: 80, peito: 100 }, DIA).dados).toEqual({ cintura: 80, peito: 100 })
  })

  it('peso é um evento de peso, não de medida', () => {
    // Os dois acabam na mesma nota do vault, mas o tipo separado é o que deixa
    // o botão de peso ser um atalho de uma tecla.
    expect(eventoPeso(78.4, DIA)).toEqual({ tipo: 'peso', dia: DIA, dados: { peso: 78.4 } })
  })

  it('anotação', () => {
    expect(eventoAnotacao('dormi mal', DIA)).toEqual({
      tipo: 'anotacao', dia: DIA, dados: { texto: 'dormi mal' }
    })
  })

  it('usa o dia de hoje quando nenhum é informado', () => {
    expect(eventoSuplemento('Creatina').dia).toBe(diaLocal())
  })

  it('recusa texto vazio', () => {
    expect(() => eventoAnotacao('   ', DIA)).toThrow()
    expect(() => eventoSuplemento('', DIA)).toThrow()
  })

  it('recusa número que não é número', () => {
    expect(() => eventoPeso(Number.NaN, DIA)).toThrow()
    expect(() => eventoCardio('esteira', Number.NaN, {}, DIA)).toThrow()
  })

  it('recusa medida sem nenhum campo', () => {
    // Um evento de medida vazio criaria uma nota em branco no vault.
    expect(() => eventoMedida({}, DIA)).toThrow()
  })

  it('corta espaço em volta do texto', () => {
    expect(eventoSuplemento('  Creatina  ', DIA).dados.nome).toBe('Creatina')
  })
})

describe('agenda e estudos', () => {
  const DIA2 = '2026-08-28'

  it('prova estudada manda o caminho, nao o titulo', () => {
    // Dois compromissos "Dentista" em semanas diferentes tem o mesmo titulo e
    // caminhos diferentes; casar por titulo marcaria o errado.
    expect(eventoProvaEstudada('Estudos/Provas/ENEM.md', DIA2)).toEqual({
      tipo: 'prova_estudada', dia: DIA2, dados: { path: 'Estudos/Provas/ENEM.md' }
    })
  })

  it('apagar item manda o caminho', () => {
    expect(eventoItemApagado('Agenda/Dentista.md', DIA2).dados)
      .toEqual({ path: 'Agenda/Dentista.md' })
  })

  it('caminho vazio nao vira evento', () => {
    expect(() => eventoProvaEstudada('   ', DIA2)).toThrow()
    expect(() => eventoItemApagado('', DIA2)).toThrow()
  })

  it('compromisso novo leva a data escolhida, nao a de hoje', () => {
    expect(eventoCompromisso('Dentista', '2026-09-10', { hora: '14:00' }, DIA2)).toEqual({
      tipo: 'compromisso', dia: DIA2,
      dados: { titulo: 'Dentista', data: '2026-09-10', hora: '14:00' }
    })
  })

  it('compromisso sem data cai no dia de hoje', () => {
    expect(eventoCompromisso('Reuniao', '', {}, DIA2).dados).toEqual({
      titulo: 'Reuniao', data: DIA2
    })
  })

  it('recusa data fora do formato', () => {
    expect(() => eventoCompromisso('X', '10/09/2026', {}, DIA2)).toThrow()
  })

  it('recusa compromisso sem titulo', () => {
    expect(() => eventoCompromisso('  ', '2026-09-10', {}, DIA2)).toThrow()
  })
})

describe('porquinho', () => {
  const DIA3 = '2026-09-01'

  it('manda o movimento, nunca o saldo', () => {
    // Se o celular mandasse saldo, dois aparelhos offline no mesmo dia
    // sobrescreveriam um ao outro e o dinheiro sumiria.
    expect(eventoPorquinho('Guardei do salario', 250, 'deposito', DIA3)).toEqual({
      tipo: 'porquinho', dia: DIA3,
      dados: { titulo: 'Guardei do salario', valor: 250, direcao: 'deposito' }
    })
  })

  it('tirar tambem e um movimento', () => {
    expect(eventoPorquinho('Peca da bike', 80, 'sangria', DIA3).dados).toEqual({
      titulo: 'Peca da bike', valor: 80, direcao: 'sangria'
    })
  })

  it('recusa valor zero ou negativo', () => {
    // Um movimento de zero nao e movimento, e um negativo seria uma sangria
    // disfarcada de deposito.
    expect(() => eventoPorquinho('x', 0, 'deposito', DIA3)).toThrow()
    expect(() => eventoPorquinho('x', -50, 'deposito', DIA3)).toThrow()
  })

  it('recusa valor que nao e numero', () => {
    expect(() => eventoPorquinho('x', Number.NaN, 'deposito', DIA3)).toThrow()
  })

  it('recusa descricao vazia', () => {
    expect(() => eventoPorquinho('   ', 100, 'deposito', DIA3)).toThrow()
  })
})

describe('marcar prova e tarefa do celular', () => {
  const D = '2026-09-02'

  it('prova nova leva materia e local', () => {
    expect(eventoProvaNova('P1 de fisica', '2026-09-20', { materia: 'fisica', local: 'sala 3' }, D))
      .toEqual({
        tipo: 'prova_nova', dia: D,
        dados: { titulo: 'P1 de fisica', data: '2026-09-20', materia: 'fisica', local: 'sala 3' }
      })
  })

  it('tarefa nova nao tem local -- o campo nem existe na tela', () => {
    expect(eventoTarefaNova('Trabalho', '2026-09-08', { materia: 'historia' }, D).dados)
      .toEqual({ titulo: 'Trabalho', data: '2026-09-08', materia: 'historia' })
  })

  it('sem data cai em hoje', () => {
    expect(eventoProvaNova('P1', '', {}, D).dados).toEqual({ titulo: 'P1', data: D })
  })

  it('recusa data fora do formato', () => {
    expect(() => eventoTarefaNova('X', '20/09/2026', {}, D)).toThrow()
  })

  it('recusa titulo vazio', () => {
    expect(() => eventoProvaNova('  ', '2026-09-20', {}, D)).toThrow()
    expect(() => eventoTarefaNova('', '2026-09-20', {}, D)).toThrow()
  })
})
