import { describe, it, expect } from 'vitest'
import type { Evento } from '../../shared/eventos'
import { planejar } from './planejar'

const ev = (tipo: string, dados: Record<string, unknown>, dia = '2026-08-27'): Evento =>
  ({ tipo, dia, dados }) as Evento

describe('planejar', () => {
  it('suplemento entra no conjunto do diario do dia', () => {
    expect(planejar(ev('suplemento', { nome: 'Whey' }))).toEqual([
      { acao: 'diario-conjunto', dia: '2026-08-27', campo: 'suplementos_feitos', valor: 'Whey' }
    ])
  })

  it('refeicao do plano entra em dieta_feitas', () => {
    expect(planejar(ev('refeicao_plano', { nome: 'Café' }))).toEqual([
      { acao: 'diario-conjunto', dia: '2026-08-27', campo: 'dieta_feitas', valor: 'Café' }
    ])
  })

  it('refeicao extra entra na lista extras', () => {
    expect(planejar(ev('refeicao_extra', { item: 'Coxinha', kcal: 300 }))).toEqual([
      { acao: 'diario-lista', dia: '2026-08-27', campo: 'extras', item: { item: 'Coxinha', kcal: 300 } }
    ])
  })

  it('gasto entra em transacoes e assume saida quando nao dizem', () => {
    expect(planejar(ev('gasto', { item: 'Almoço', valor: 32, cat: 'alimentacao' }))).toEqual([
      { acao: 'diario-lista', dia: '2026-08-27', campo: 'transacoes',
        item: { dir: 'saida', item: 'Almoço', valor: 32, cat: 'alimentacao' } }
    ])
  })

  it('gasto respeita a direcao quando ela vem', () => {
    const [op] = planejar(ev('gasto', { item: 'Freela', valor: 500, dir: 'entrada' }))
    expect(op).toMatchObject({ acao: 'diario-lista', item: { dir: 'entrada' } })
  })

  it('gasto com direcao invalida vira saida, nao passa cru', () => {
    const [op] = planejar(ev('gasto', { item: 'Estranho', valor: 10, dir: 'lateral' }))
    expect(op).toMatchObject({ acao: 'diario-lista', item: { dir: 'saida' } })
  })

  it('gasto com direcao em caixa diferente vira saida, nao normaliza', () => {
    const [op] = planejar(ev('gasto', { item: 'Freela', valor: 500, dir: 'ENTRADA' }))
    expect(op).toMatchObject({ acao: 'diario-lista', item: { dir: 'saida' } })
  })

  it('sessao cria uma nota de treino com o titulo previsivel', () => {
    expect(planejar(ev('sessao', {
      modelo: 'Push A', exercicios: [{ nome: 'Supino', carga: '60 kg' }]
    }))).toEqual([{
      acao: 'nota', tipo: 'sessao', seExistir: 'mesclar', path: 'Saude/Treinos/Push A — 2026-08-27.md',
      frontmatter: {
        tipo: 'sessao', date: '2026-08-27',
        exercicios: [{ nome: 'Supino', carga: '60 kg' }], modelo: 'Push A'
      }
    }])
  })

  it('evento de sessao nao pode escolher o tipo nem a data da nota', () => {
    const [op] = planejar(ev('sessao', {
      modelo: 'Push A', tipo: 'conta', date: '1970-01-01'
    }))
    expect(op).toMatchObject({
      acao: 'nota', tipo: 'sessao',
      frontmatter: { tipo: 'sessao', date: '2026-08-27' }
    })
  })

  it('cardio cria a nota do dia', () => {
    const [op] = planejar(ev('cardio', { aparelho: 'esteira', minutos: 30, pace: '5:45' }))
    expect(op).toEqual({
      acao: 'nota', tipo: 'cardio', seExistir: 'mesclar', path: 'Saude/Treinos/cardio-2026-08-27.md',
      frontmatter: { tipo: 'cardio', date: '2026-08-27', aparelho: 'esteira', minutos: 30, pace: '5:45' }
    })
  })

  it('evento de cardio nao pode escolher o tipo nem a data da nota', () => {
    const [op] = planejar(ev('cardio', {
      aparelho: 'esteira', minutos: 30, tipo: 'conta', date: '1970-01-01'
    }))
    expect(op).toMatchObject({
      acao: 'nota', tipo: 'cardio',
      frontmatter: { tipo: 'cardio', date: '2026-08-27' }
    })
  })

  it('peso e medida caem na MESMA nota do dia — o grafico de peso e um so', () => {
    const p = planejar(ev('peso', { peso: 78.4 }))
    const m = planejar(ev('medida', { peso: 78.4, cintura: 84 }))
    expect(p[0]).toMatchObject({ path: 'Saude/medida-2026-08-27.md' })
    expect(m[0]).toMatchObject({ path: 'Saude/medida-2026-08-27.md' })
    expect(p[0]).toMatchObject({ acao: 'nota-campos' })
  })

  it('evento de medida nao pode escolher o tipo nem a data da nota', () => {
    const [op] = planejar(ev('medida', {
      peso: 78.4, tipo: 'conta', date: '1970-01-01'
    }))
    expect(op).toMatchObject({
      acao: 'nota-campos', tipo: 'medida',
      campos: { tipo: 'medida', date: '2026-08-27' }
    })
  })

  it('anotacao vira nota com titulo tirado do texto', () => {
    const [op] = planejar(ev('anotacao', { texto: 'Comprar caderno novo para o cursinho' }))
    expect(op).toMatchObject({
      acao: 'nota', tipo: 'anotacao', seExistir: 'criarOutro',
      path: expect.stringContaining('Vida/'),
      frontmatter: { tipo: 'anotacao', texto: 'Comprar caderno novo para o cursinho' }
    })
  })

  it('anotacao nunca mescla — duas anotacoes diferentes nao podem se apagar', () => {
    const [op1] = planejar(ev('anotacao', { texto: 'Lembrar de pagar conta de luz' }))
    const [op2] = planejar(ev('anotacao', { texto: 'Lembrar de pagar conta do cartão' }, '2026-08-28'))
    expect(op1).toMatchObject({ seExistir: 'criarOutro' })
    expect(op2).toMatchObject({ seExistir: 'criarOutro' })
  })

  it('tipo desconhecido nao gera operacao — Cortex velho + app novo nao quebra', () => {
    expect(planejar(ev('coisa-do-futuro', {}))).toEqual([])
  })

  it('suplemento sem nome nao vira operacao vazia', () => {
    expect(planejar(ev('suplemento', {}))).toEqual([])
  })

  // `dados` vem do banco como Record<string, unknown> livre — tao hostil
  // quanto o frontmatter que cardapio.ts le. `String(array)` junta os
  // elementos com virgula, entao um array escaparia grudado no texto se
  // txt() nao filtrasse por escalar puro (ver util.ts). Os tres casos abaixo
  // sao os mesmos campos citados na revisao: nome, modelo e texto.
  it('suplemento com nome vindo como array nao concatena a string escondida no resultado', () => {
    const ops = planejar(ev('suplemento', { nome: ['Whey', 'SEGREDO-NOME-ARRAY'] }))
    expect(JSON.stringify(ops)).not.toContain('SEGREDO-NOME-ARRAY')
    // nome vira '' pela guarda de escalar — sem nome, nao ha operacao.
    expect(ops).toEqual([])
  })

  it('sessao com modelo vindo como array cai no nome padrao, nao concatena a string escondida', () => {
    const ops = planejar(ev('sessao', { modelo: ['Push A', 'SEGREDO-MODELO-ARRAY'] }))
    expect(JSON.stringify(ops)).not.toContain('SEGREDO-MODELO-ARRAY')
    expect(ops[0]).toMatchObject({
      path: expect.stringContaining('Treino livre'),
      frontmatter: { modelo: 'Treino livre' }
    })
  })

  it('anotacao com texto vindo como array nao concatena a string escondida — vira operacao vazia', () => {
    const ops = planejar(ev('anotacao', { texto: ['Ideia', 'SEGREDO-TEXTO-ARRAY'] }))
    expect(JSON.stringify(ops)).not.toContain('SEGREDO-TEXTO-ARRAY')
    // texto vira '' pela guarda de escalar — depois do trim fica vazio, sem
    // titulo possivel, entao nenhuma operacao e gerada.
    expect(ops).toEqual([])
  })
})

/*
 * Agenda e estudos.
 *
 * Os dois de marcar recebem o caminho que o proprio Cortex publicou. O que
 * estes testes protegem e a guarda de tipo: o caminho vem de fora, e sem ela
 * um evento escreveria em qualquer nota do vault.
 */
describe('planejar — agenda e estudos', () => {
  it('prova estudada vira marcacao na nota da prova', () => {
    expect(planejar({
      tipo: 'prova_estudada', dia: '2026-08-28',
      dados: { path: 'Estudos/Provas/ENEM.md' }
    })).toEqual([{
      acao: 'marcar', path: 'Estudos/Provas/ENEM.md',
      tiposPermitidos: ['prova', 'simulado'],
      campos: { estudado: true, estudado_em: '2026-08-28' }
    }])
  })

  it('cancelar compromisso marca, nao apaga', () => {
    // Um toque errado no onibus nao pode sumir com o arquivo.
    const ops = planejar({
      tipo: 'compromisso_cancelado', dia: '2026-08-28',
      dados: { path: 'Agenda/Dentista.md' }
    })
    expect(ops).toEqual([{
      acao: 'marcar', path: 'Agenda/Dentista.md',
      tiposPermitidos: ['evento'],
      campos: { cancelado: true, cancelado_em: '2026-08-28' }
    }])
  })

  it('marcar sem caminho nao produz operacao nenhuma', () => {
    expect(planejar({ tipo: 'prova_estudada', dia: '2026-08-28', dados: {} })).toEqual([])
    expect(planejar({ tipo: 'compromisso_cancelado', dia: '2026-08-28', dados: {} })).toEqual([])
  })

  it('caminho que nao e texto nao vira operacao', () => {
    // String(['a','b']) junta com virgula e produziria um caminho inventado.
    expect(planejar({
      tipo: 'prova_estudada', dia: '2026-08-28', dados: { path: ['a', 'b'] }
    })).toEqual([])
  })

  it('compromisso novo cai na Agenda com a data que veio', () => {
    const ops = planejar({
      tipo: 'compromisso', dia: '2026-08-28',
      dados: { titulo: 'Dentista', data: '2026-09-10', hora: '14:00', local: 'Centro' }
    })
    expect(ops).toEqual([{
      acao: 'nota', tipo: 'evento', seExistir: 'criarOutro',
      path: 'Agenda/Dentista.md',
      frontmatter: {
        tipo: 'evento', title: 'Dentista', date: '2026-09-10',
        hora: '14:00', local: 'Centro'
      }
    }])
  })

  it('compromisso sem data cai no dia do evento', () => {
    const ops = planejar({ tipo: 'compromisso', dia: '2026-08-28', dados: { titulo: 'Reuniao' } })
    expect((ops[0] as any).frontmatter.date).toBe('2026-08-28')
  })

  it('compromisso sem titulo nao vira nota', () => {
    expect(planejar({ tipo: 'compromisso', dia: '2026-08-28', dados: { titulo: '  ' } })).toEqual([])
  })

  it('o evento nao escolhe o tipo da nota', () => {
    // `tipo` decide o que a nota E para o app inteiro; um evento vindo do
    // banco nao pode espalhar `dados.tipo` por cima e virar uma senha.
    const ops = planejar({
      tipo: 'compromisso', dia: '2026-08-28',
      dados: { titulo: 'Reuniao', tipo: 'senha', title: 'outro', date: '1999-01-01' }
    })
    const fm = (ops[0] as any).frontmatter
    expect(fm.tipo).toBe('evento')
    expect(fm.title).toBe('Reuniao')
    expect(fm.date).toBe('2026-08-28')
  })

  it('nao deixa campo de transporte virar campo da nota', () => {
    const ops = planejar({
      tipo: 'compromisso', dia: '2026-08-28',
      dados: { titulo: 'Reuniao', path: 'Vida/Contas/Nubank.md' }
    })
    const fm = (ops[0] as any).frontmatter
    expect(fm.path).toBeUndefined()
    expect(fm.titulo).toBeUndefined()
    expect(fm.data).toBeUndefined()
  })

  it('barra no titulo nao escapa da pasta Agenda', () => {
    const ops = planejar({
      tipo: 'compromisso', dia: '2026-08-28', dados: { titulo: '../../fora' }
    })
    // As barras viram tracos, entao o caminho nao sobe pasta nenhuma: ele
    // continua sendo um nome de arquivo unico dentro de Agenda/.
    expect((ops[0] as any).path).toBe('Agenda/..-..-fora.md')
    expect((ops[0] as any).path.split('/')).toHaveLength(2)
  })
})

describe('planejar — prova e tarefa marcadas do celular', () => {
  it('prova nova vira nota em Estudos/Provas', () => {
    expect(planejar({
      tipo: 'prova_nova', dia: '2026-09-02',
      dados: { titulo: 'P1 de fisica', data: '2026-09-20', materia: 'fisica' }
    })).toEqual([{
      acao: 'nota', tipo: 'prova', seExistir: 'criarOutro',
      path: 'Estudos/Provas/P1 de fisica.md',
      frontmatter: { tipo: 'prova', title: 'P1 de fisica', date: '2026-09-20', materia: 'fisica' }
    }])
  })

  it('tarefa nova vira nota em Estudos', () => {
    const ops = planejar({
      tipo: 'tarefa_nova', dia: '2026-09-02',
      dados: { titulo: 'Trabalho', data: '2026-09-08' }
    })
    expect((ops[0] as any).path).toBe('Estudos/Trabalho.md')
    expect((ops[0] as any).tipo).toBe('tarefa')
  })

  it('o evento nao escolhe o tipo da nota', () => {
    // Mesma guarda dos outros casos: `tipo` decide o que a nota E para o app
    // inteiro, e um evento vindo do banco nao pode espalhar o dele por cima.
    const ops = planejar({
      tipo: 'prova_nova', dia: '2026-09-02',
      dados: { titulo: 'P1', tipo: 'senha', title: 'outro', date: '1999-01-01' }
    })
    const fm = (ops[0] as any).frontmatter
    expect(fm.tipo).toBe('prova')
    expect(fm.title).toBe('P1')
    expect(fm.date).toBe('2026-09-02')
  })

  it('sem titulo nao vira nota', () => {
    expect(planejar({ tipo: 'prova_nova', dia: '2026-09-02', dados: { titulo: ' ' } })).toEqual([])
  })
})
