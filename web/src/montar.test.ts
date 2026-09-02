import { describe, it, expect } from 'vitest'
import {
  diaLocal, eventoSuplemento, eventoRefeicaoPlano, eventoRefeicaoExtra,
  eventoGasto, eventoSessao, eventoCardio, eventoMedida, eventoPeso, eventoAnotacao,
  eventoProvaEstudada, eventoCompromisso, eventoCompromissoCancelado, eventoPorquinho
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

  it('sessão de treino leva a carga', () => {
    const e = eventoSessao('Peito e tríceps', [
      { nome: 'Supino reto', series: 4, reps: '8-10', carga: 60 },
      { nome: 'Crucifixo', series: 3, reps: '12' }
    ], DIA)
    expect(e.tipo).toBe('sessao')
    expect(e.dados).toEqual({
      modelo: 'Peito e tríceps',
      exercicios: [
        { nome: 'Supino reto', series: 4, reps: '8-10', carga: 60 },
        { nome: 'Crucifixo', series: 3, reps: '12' }
      ]
    })
  })

  it('sessão descarta exercício sem nome', () => {
    const e = eventoSessao('Peito', [{ nome: '' }, { nome: 'Supino' }], DIA)
    expect(e.dados.exercicios as unknown[]).toHaveLength(1)
  })

  it('sessão sem nenhum exercício não passa', () => {
    expect(() => eventoSessao('Peito', [{ nome: '  ' }], DIA)).toThrow()
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

  it('cancelar compromisso manda o caminho', () => {
    expect(eventoCompromissoCancelado('Agenda/Dentista.md', DIA2).dados)
      .toEqual({ path: 'Agenda/Dentista.md' })
  })

  it('caminho vazio nao vira evento', () => {
    expect(() => eventoProvaEstudada('   ', DIA2)).toThrow()
    expect(() => eventoCompromissoCancelado('', DIA2)).toThrow()
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
