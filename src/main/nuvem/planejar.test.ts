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
    // Duas operacoes: o check, e a limpeza do detalhe. Marcar sem dizer
    // quanto comeu quer dizer "comi tudo" -- e um "comi metade" de antes nao
    // pode ficar pendurado numa refeicao que acabou de ser marcada inteira.
    expect(planejar(ev('refeicao_plano', { nome: 'Café' }))).toEqual([
      { acao: 'diario-conjunto', dia: '2026-08-27', campo: 'dieta_feitas', valor: 'Café' },
      {
        acao: 'diario-item', dia: '2026-08-27', campo: 'dieta_detalhes',
        chave: 'nome', valor: 'Café', item: null
      }
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

  it('anotacao com prioridade grava a marca; sem ela, o campo nem existe', () => {
    const [comMarca] = planejar(ev('anotacao', { texto: 'Ligar pro dentista', prioridade: true }))
    expect(comMarca).toMatchObject({ frontmatter: { prioridade: true } })

    // `comValor` tira o `undefined`: uma anotacao comum nao carrega
    // `prioridade: false` no frontmatter -- e uma linha que ninguem le.
    const [semMarca] = planejar(ev('anotacao', { texto: 'Dormi mal' }))
    expect((semMarca as { frontmatter: Record<string, unknown> }).frontmatter)
      .not.toHaveProperty('prioridade')

    // Qualquer coisa que nao seja `true` nao marca -- inclusive a string
    // "true", que e o que um cliente torto mandaria.
    const [comTexto] = planejar(ev('anotacao', { texto: 'Nada', prioridade: 'true' }))
    expect((comTexto as { frontmatter: Record<string, unknown> }).frontmatter)
      .not.toHaveProperty('prioridade')
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

  it('estudado false desmarca, apagando os dois campos', () => {
    // `null` apaga a chave do frontmatter (ver patchFrontmatter). Desmarcar
    // devolve a nota ao estado de quem nunca estudou, em vez de deixar
    // `estudado: false` e uma data de quando NAO estudou.
    expect(planejar({
      tipo: 'prova_estudada', dia: '2026-08-28',
      dados: { path: 'Estudos/Provas/ENEM.md', estudado: false }
    })).toEqual([{
      acao: 'marcar', path: 'Estudos/Provas/ENEM.md',
      tiposPermitidos: ['prova', 'simulado'],
      campos: { estudado: null, estudado_em: null }
    }])
  })

  it('sem o campo estudado, marca -- e nao desmarca', () => {
    // Um evento gravado por uma versao anterior do app do celular nao carrega
    // `estudado`. Ele esperou na fila sem sinal e chega agora; tratar a
    // ausencia como "false" desmarcaria uma prova que a pessoa marcou.
    const ops = planejar({
      tipo: 'prova_estudada', dia: '2026-08-28',
      dados: { path: 'Estudos/Provas/ENEM.md' }
    })
    expect(ops[0]).toMatchObject({ campos: { estudado: true } })
  })

  it('editar alcanca prova e tarefa, e nao so compromisso', () => {
    // A lista e a MESMA de `item_apagado`: sao os quatro tipos que o celular
    // ja pode criar e apagar. Poder editar um deles nao alcanca nada que
    // apagar ja nao alcancasse.
    const ops = planejar({
      tipo: 'compromisso_editado', dia: '2026-08-28',
      dados: { path: 'Estudos/Provas/ENEM.md', materia: 'fisica', data: '2026-09-12' }
    })
    expect(ops).toEqual([{
      acao: 'marcar', path: 'Estudos/Provas/ENEM.md',
      tiposPermitidos: [
        'evento', 'prova', 'simulado', 'tarefa', 'anotacao', 'suplemento', 'rotina'
      ],
      campos: { date: '2026-09-12', materia: 'fisica' }
    }])
  })

  it('editar nao escreve `tipo`, nem que o evento mande', () => {
    // A lista branca campo a campo, e nao um spread de `dados`: com spread,
    // um evento reescreveria `tipo` e a prova viraria outra coisa.
    const ops = planejar({
      tipo: 'compromisso_editado', dia: '2026-08-28',
      dados: { path: 'Agenda/Dentista.md', titulo: 'Dentista', tipo: 'senha', usuario: 'x' }
    })
    expect(Object.keys((ops[0] as { campos: Record<string, unknown> }).campos)).toEqual(['title'])
  })

  it('apagar um item da agenda apaga a nota', () => {
    // Mudou de "marcar cancelado" para apagar de verdade: foi o que o dono
    // pediu. O que segura um toque errado passa a ser a confirmacao na tela.
    expect(planejar({
      tipo: 'item_apagado', dia: '2026-08-28',
      dados: { path: 'Agenda/Dentista.md' }
    })).toEqual([{
      acao: 'apagar', path: 'Agenda/Dentista.md',
      tiposPermitidos: ['evento', 'prova', 'simulado', 'tarefa', 'anotacao']
    }])
  })

  it('apagar nao alcanca nota que nao seja de agenda ou estudos', () => {
    // A lista de tipos e o que impede este evento de chegar num documento ou
    // numa senha. Ela viaja com a operacao e o executor a confere no disco.
    const ops = planejar({
      tipo: 'item_apagado', dia: '2026-08-28', dados: { path: 'Vida/Contas/Gmail.md' }
    })
    expect((ops[0] as any).tiposPermitidos).not.toContain('senha')
    expect((ops[0] as any).tiposPermitidos).not.toContain('documento')
  })

  it('marcar sem caminho nao produz operacao nenhuma', () => {
    expect(planejar({ tipo: 'prova_estudada', dia: '2026-08-28', dados: {} })).toEqual([])
    expect(planejar({ tipo: 'item_apagado', dia: '2026-08-28', dados: {} })).toEqual([])
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

/**
 * Desmarcar o check.
 *
 * Vai no mesmo tipo de evento com o sinal trocado, e nao num tipo novo: um
 * tipo novo teria de entrar tambem em `tipos_validos()`, no banco, e isso
 * exige rodar o SQL do Supabase de novo para o evento fazer exatamente a
 * mesma coisa ao contrario.
 */
describe('planejar — desmarcar suplemento e refeicao', () => {
  it('feito false tira do conjunto do diario', () => {
    expect(planejar(ev('suplemento', { nome: 'Creatina', feito: false }))).toEqual([
      { acao: 'diario-tirar', dia: '2026-08-27', campo: 'suplementos_feitos', valor: 'Creatina' }
    ])
    expect(planejar(ev('refeicao_plano', { nome: 'Café', feito: false }))).toEqual([
      { acao: 'diario-tirar', dia: '2026-08-27', campo: 'dieta_feitas', valor: 'Café' },
      {
        acao: 'diario-item', dia: '2026-08-27', campo: 'dieta_detalhes',
        chave: 'nome', valor: 'Café', item: null
      }
    ])
  })

  it('sem o campo, marca -- e nao desmarca', () => {
    // Um evento gravado pelo app do celular ANTES desta mudanca nao carrega
    // `feito`. Ele pode ter esperado dias na fila sem sinal; tratar a
    // ausencia como `false` desmarcaria o que a pessoa marcou.
    expect(planejar(ev('suplemento', { nome: 'Creatina' })))
      .toEqual([{ acao: 'diario-conjunto', dia: '2026-08-27', campo: 'suplementos_feitos', valor: 'Creatina' }])
  })

  it('so o booleano false desmarca -- a string "false" nao', () => {
    // `dados` vem do banco como registro livre. Qualquer coisa que nao seja
    // exatamente `false` cai no lado seguro, que e marcar.
    expect(planejar(ev('suplemento', { nome: 'Creatina', feito: 'false' })))
      .toMatchObject([{ acao: 'diario-conjunto' }])
    expect(planejar(ev('suplemento', { nome: 'Creatina', feito: 0 })))
      .toMatchObject([{ acao: 'diario-conjunto' }])
  })

  it('desmarcar sem nome nao vira operacao', () => {
    expect(planejar(ev('suplemento', { feito: false }))).toEqual([])
  })
})

/**
 * Comi quanto, e troquei por que.
 *
 * O detalhe vive numa lista propria (`dieta_detalhes`), e nao dentro de
 * `dieta_feitas`: aquele conjunto e o que a lente Saude conta e o que o
 * celular usa para desenhar o check, e mudar o formato dele quebraria os dois
 * para todo dia ja gravado.
 */
describe('planejar — detalhe da refeicao', () => {
  const detalhe = (ops: ReturnType<typeof planejar>) =>
    ops.find(o => o.acao === 'diario-item')

  it('nivel vira um item de dieta_detalhes', () => {
    expect(detalhe(planejar(ev('refeicao_plano', { nome: 'Almoço', nivel: 'metade' })))).toEqual({
      acao: 'diario-item', dia: '2026-08-27', campo: 'dieta_detalhes',
      chave: 'nome', valor: 'Almoço', item: { nome: 'Almoço', nivel: 'metade' }
    })
  })

  it('a troca entra junto, e sozinha tambem vale', () => {
    expect(detalhe(planejar(ev('refeicao_plano', { nome: 'Janta', troca: 'pizza' })))?.item)
      .toEqual({ nome: 'Janta', troca: 'pizza' })
    expect(detalhe(planejar(ev('refeicao_plano', {
      nome: 'Janta', nivel: 'pouco', troca: 'pizza'
    })))?.item).toEqual({ nome: 'Janta', nivel: 'pouco', troca: 'pizza' })
  })

  it('nivel que a tela nao conhece e descartado', () => {
    // `dados` vem do banco como registro livre. Um "nivel: 3" viraria um
    // valor que nenhuma das duas telas sabe desenhar, escrito no vault.
    expect(detalhe(planejar(ev('refeicao_plano', { nome: 'Café', nivel: 'tudo' })))?.item).toBe(null)
    expect(detalhe(planejar(ev('refeicao_plano', { nome: 'Café', nivel: 3 })))?.item).toBe(null)
    expect(detalhe(planejar(ev('refeicao_plano', { nome: 'Café', nivel: 'muito' })))?.item).toBe(null)
  })

  it('desmarcar apaga o detalhe, mesmo com nivel no evento', () => {
    // Senao o diario guardaria "comi metade" de uma refeicao que a propria
    // pessoa acabou de dizer que nao comeu.
    expect(detalhe(planejar(ev('refeicao_plano', {
      nome: 'Café', feito: false, nivel: 'metade', troca: 'nada'
    })))?.item).toBe(null)
  })

  it('a troca tem teto de 120 caracteres', () => {
    const item = detalhe(planejar(ev('refeicao_plano', {
      nome: 'Café', troca: 'x'.repeat(500)
    })))?.item as { troca: string }
    expect(item.troca).toHaveLength(120)
  })
})

/**
 * A tarefa diaria.
 *
 * Conjunto proprio no diario (`rotinas_feitas`), e nao o dos suplementos: a
 * lente Saude conta `suplementos_feitos` para dizer quantos foram tomados no
 * dia, e "escovar os dentes" entrando ali estragaria essa conta.
 */
describe('planejar — tarefa diaria', () => {
  it('marca no conjunto proprio do diario', () => {
    expect(planejar(ev('rotina_feita', { nome: 'Tomar 3 L de agua' }))).toEqual([
      { acao: 'diario-conjunto', dia: '2026-08-27', campo: 'rotinas_feitas', valor: 'Tomar 3 L de agua' }
    ])
  })

  it('desmarca com feito false, como o suplemento', () => {
    expect(planejar(ev('rotina_feita', { nome: 'Tomar 3 L de agua', feito: false }))).toEqual([
      { acao: 'diario-tirar', dia: '2026-08-27', campo: 'rotinas_feitas', valor: 'Tomar 3 L de agua' }
    ])
  })

  it('nao encosta no conjunto dos suplementos', () => {
    const [op] = planejar(ev('rotina_feita', { nome: 'Escovar os dentes' }))
    expect(op).toMatchObject({ campo: 'rotinas_feitas' })
    expect(JSON.stringify(op)).not.toContain('suplementos_feitos')
  })

  it('sem nome nao vira operacao', () => {
    expect(planejar(ev('rotina_feita', {}))).toEqual([])
  })
})

/**
 * A agua do dia.
 *
 * Soma, e nao substitui: cada garrafa e um evento proprio. Dois aparelhos --
 * ou o mesmo depois de ficar sem sinal -- mandariam totais diferentes se cada
 * um enviasse "o total agora e X".
 */
describe('planejar — agua', () => {
  it('cada garrafa soma ao total do dia', () => {
    expect(planejar(ev('agua', { ml: 800 }))).toEqual([
      { acao: 'diario-somar', dia: '2026-08-27', campo: 'agua_ml', quanto: 800 }
    ])
  })

  it('ml negativo desfaz o toque a mais', () => {
    expect(planejar(ev('agua', { ml: -800 }))).toEqual([
      { acao: 'diario-somar', dia: '2026-08-27', campo: 'agua_ml', quanto: -800 }
    ])
  })

  it('zero nao vira operacao -- seria uma escrita que nao muda nada', () => {
    expect(planejar(ev('agua', { ml: 0 }))).toEqual([])
    expect(planejar(ev('agua', {}))).toEqual([])
  })

  it('recusa numero absurdo, em vez de contaminar o total', () => {
    // `dados` vem do banco como registro livre. Um numero fora de escala --
    // de um app com defeito, ou de quem tenha o id do vault -- estragaria o
    // total do dia sem ninguem notar. Cinco litros de uma vez ja e mais do
    // que qualquer garrafa.
    expect(planejar(ev('agua', { ml: 999999 }))).toEqual([])
    expect(planejar(ev('agua', { ml: -999999 }))).toEqual([])
  })

  it('so numero de verdade passa', () => {
    // String, objeto e NaN nao sao ml. `num()` recusa os tres.
    expect(planejar(ev('agua', { ml: '800' }))).toEqual([])
    expect(planejar(ev('agua', { ml: { valor: 800 } }))).toEqual([])
    expect(planejar(ev('agua', { ml: Number.NaN }))).toEqual([])
  })

  it('arredonda: ml e numero inteiro', () => {
    expect(planejar(ev('agua', { ml: 333.7 }))).toMatchObject([{ quanto: 334 }])
  })
})

describe('as etapas do vestibular', () => {
  const P = 'Estudos/Provas/Unicamp 1a fase.md'

  it('inscricao marcada grava o campo e o dia', () => {
    // A data fica porque prazo de vestibular se discute depois: "paguei dia
    // 12" e o que resolve uma duvida com a banca, e o dia do toque e a unica
    // fonte disso que existe.
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'inscrito', feito: true }))).toEqual([
      {
        acao: 'marcar', path: P, tiposPermitidos: ['prova', 'simulado'],
        campos: { inscrito: true, inscrito_em: '2026-08-27' }
      }
    ])
  })

  const marcar = (campos: Record<string, unknown>) =>
    [{ acao: 'marcar', path: P, tiposPermitidos: ['prova', 'simulado'], campos }]

  it('pagamento tem o seu proprio par de campos', () => {
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'pago', feito: true })))
      .toEqual(marcar({ pago: true, pago_em: '2026-08-27' }))
  })

  it('desfazer apaga a chave, e nao grava `false`', () => {
    // `inscrito: false` com uma data de quando NAO se inscreveu nao quer
    // dizer nada -- `null` devolve a nota ao estado de quem nunca fez.
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'inscrito', feito: false })))
      .toEqual(marcar({ inscrito: null, inscrito_em: null }))
  })

  it('sem o campo `feito`, conta como marcar', () => {
    // Um evento parado na fila do celular desde antes deste campo existir nao
    // pode virar uma desmarcacao ao ser aplicado.
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'inscrito' })))
      .toEqual(marcar({ inscrito: true, inscrito_em: '2026-08-27' }))
  })

  it('etapa desconhecida nao vira operacao nenhuma', () => {
    // O evento vem do banco, que e dado de fora: uma etapa inventada nao pode
    // gravar uma chave qualquer no frontmatter da nota.
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'matriculado' }))).toEqual([])
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'estudado' }))).toEqual([])
  })

  it('sem caminho, nao mexe em nada', () => {
    expect(planejar(ev('prova_etapa', { etapa: 'inscrito' }))).toEqual([])
  })

  it('so alcanca prova e simulado', () => {
    // A mesma trava do `prova_estudada`: este evento nao pode marcar
    // "inscrito" numa conta ou num documento.
    expect(planejar(ev('prova_etapa', { path: P, etapa: 'pago' })))
      .toEqual(marcar({ pago: true, pago_em: '2026-08-27' }))
  })
})

describe('planejar — sessao de estudo', () => {
  it('vira linha no diario do dia, e nao nota', () => {
    // Linha, e nao nota propria: estudar duas vezes no mesmo dia e o caso
    // normal, e uma nota por dia faria a segunda sessao apagar a primeira.
    expect(planejar(ev('estudo', { materia: 'Matemática', minutos: 120 }))).toEqual([
      {
        acao: 'diario-lista', dia: '2026-08-27', campo: 'estudos',
        item: { materia: 'Matemática', minutos: 120 }
      }
    ])
  })

  it('leva questoes e acertos quando houve', () => {
    const [op] = planejar(ev('estudo', {
      materia: 'Física', minutos: 60, questoes: 20, acertos: 14, obs: 'travei em ondas'
    }))
    expect(op).toEqual({
      acao: 'diario-lista', dia: '2026-08-27', campo: 'estudos',
      item: {
        materia: 'Física', minutos: 60, questoes: 20, acertos: 14, obs: 'travei em ondas'
      }
    })
  })

  it('sem materia ou sem minutos, nada acontece', () => {
    // Sem minutos nao ha o que somar, e sem materia o dado nao entra em
    // grafico nenhum. Descartar e melhor do que guardar meia sessao.
    expect(planejar(ev('estudo', { minutos: 60 }))).toEqual([])
    expect(planejar(ev('estudo', { materia: 'Química' }))).toEqual([])
    expect(planejar(ev('estudo', { materia: 'Química', minutos: 0 }))).toEqual([])
    expect(planejar(ev('estudo', { materia: 'Química', minutos: -30 }))).toEqual([])
  })

  it('doze horas seguidas e app com defeito, nao estudo', () => {
    // O teto existe para um numero absurdo nao contaminar o total da semana
    // sem ninguem notar -- ninguem confere a soma de um grafico.
    expect(planejar(ev('estudo', { materia: 'História', minutos: 721 }))).toEqual([])
    expect(planejar(ev('estudo', { materia: 'História', minutos: 720 }))).toHaveLength(1)
  })

  it('acertar mais do que se resolveu vira o maximo possivel', () => {
    // Quem digitou 10 de 8 errou o campo, nao a sessao inteira: limitar
    // guarda o estudo, descartar perderia as duas horas junto.
    expect(planejar(ev('estudo', {
      materia: 'Biologia', minutos: 45, questoes: 8, acertos: 10
    }))).toEqual([{
      acao: 'diario-lista', dia: '2026-08-27', campo: 'estudos',
      item: { materia: 'Biologia', minutos: 45, questoes: 8, acertos: 8 }
    }])
  })

  it('nao deixa o evento escolher o que entra no diario', () => {
    // Os campos sao copiados um a um, e nao espalhados: este item vai para o
    // frontmatter de um arquivo do vault, e um evento vindo de fora nao
    // escolhe o que se escreve la. Comparar a operacao INTEIRA e o que pega
    // um campo a mais: checar so `item.materia` deixaria `senha` passar.
    expect(planejar(ev('estudo', {
      materia: 'Redação', minutos: 30,
      tipo: 'documento', date: '1999-01-01', senha: 'SEGREDO'
    }))).toEqual([{
      acao: 'diario-lista', dia: '2026-08-27', campo: 'estudos',
      item: { materia: 'Redação', minutos: 30 }
    }])
  })

  it('arredonda os minutos -- meio minuto de estudo nao existe', () => {
    expect(planejar(ev('estudo', { materia: 'Inglês', minutos: 45.7 }))).toEqual([{
      acao: 'diario-lista', dia: '2026-08-27', campo: 'estudos',
      item: { materia: 'Inglês', minutos: 46 }
    }])
  })
})

/**
 * A data comemorativa.
 *
 * Vai dentro do evento `compromisso`, com uma marca, e nao num tipo proprio:
 * tipo novo teria de entrar em `tipos_validos()` no banco, e isso obrigaria a
 * rodar o SQL do Supabase de novo para o app fazer o que o Cortex ja sabe.
 */
describe('planejar — data comemorativa', () => {
  it('vira nota que se repete, com dia e mes em vez de data', () => {
    const [op] = planejar(ev('compromisso', {
      titulo: 'Aniversário da mãe', data: '1970-12-20', comemorativa: true
    }))
    expect(op).toEqual({
      acao: 'nota', tipo: 'data-comemorativa', seExistir: 'mesclar',
      path: 'Agenda/Aniversário da mãe.md',
      frontmatter: {
        tipo: 'data-comemorativa', title: 'Aniversário da mãe',
        dia: 20, mes: 12, ano: 1970
      }
    })
  })

  it('ano igual ao corrente nao entra -- e o padrao do seletor, nao um fato', () => {
    // O campo do celular e uma data inteira. Quem nao sabe o ano de nascimento
    // deixa o que veio preenchido, e contar isso anunciaria "faz 0 anos".
    const [op] = planejar(ev('compromisso', {
      titulo: 'Aniversário do João', data: '2026-03-05', comemorativa: true
    }))
    expect((op as { frontmatter: Record<string, unknown> }).frontmatter)
      .not.toHaveProperty('ano')
  })

  it('sem a marca continua sendo compromisso comum', () => {
    const [op] = planejar(ev('compromisso', { titulo: 'Dentista', data: '2026-09-10' }))
    expect(op).toMatchObject({ acao: 'nota', tipo: 'evento' })
  })

  it('a marca precisa ser o booleano -- a string "true" nao vale', () => {
    // `dados` vem do banco como registro livre, e qualquer coisa que nao seja
    // exatamente `true` cai no lado conhecido.
    const [op] = planejar(ev('compromisso', {
      titulo: 'Dentista', data: '2026-09-10', comemorativa: 'true'
    }))
    expect(op).toMatchObject({ tipo: 'evento' })
  })

  it('data sem mes ou dia nao vira nota', () => {
    expect(planejar(ev('compromisso', {
      titulo: 'Sem data', data: 'amanhã', comemorativa: true
    }))).toEqual([])
  })

  it('mescla em vez de criar outra: o aniversario dela e um so', () => {
    // Ao contrario do compromisso, que usa 'criarOutro' porque dois dentistas
    // em semanas diferentes sao dois compromissos.
    const [op] = planejar(ev('compromisso', {
      titulo: 'Aniversário da mãe', data: '1970-12-20', comemorativa: true
    }))
    expect(op).toMatchObject({ seExistir: 'mesclar' })
  })

  it('editar escreve dia, mes e ano -- nao `date`, que a nota nao le', () => {
    // Era o botao de editar que nao fazia nada: o caminho comum so alcancava
    // evento/prova/tarefa, e escreveria `date`.
    const ops = planejar(ev('compromisso_editado', {
      path: 'Agenda/niver tia lu.md', titulo: 'Niver da tia Lu',
      data: '1983-09-11', comemorativa: true
    }))
    expect(ops).toEqual([{
      acao: 'marcar', path: 'Agenda/niver tia lu.md',
      tiposPermitidos: ['data-comemorativa'],
      campos: { title: 'Niver da tia Lu', dia: 11, mes: 9, ano: 1983 }
    }])
  })

  it('editar com o ano corrente mexe em dia e mes, e nao inventa ano', () => {
    const [op] = planejar(ev('compromisso_editado', {
      path: 'Agenda/x.md', data: '2026-01-12', comemorativa: true
    })) as { campos: Record<string, unknown> }[]
    expect(op.campos).toEqual({ dia: 12, mes: 1 })
  })

  it('a marca nao alcanca outra especie de nota', () => {
    const [op] = planejar(ev('compromisso_editado', {
      path: 'Vida/Senhas/banco.md', data: '1990-01-01', comemorativa: true
    })) as { tiposPermitidos: string[] }[]
    expect(op.tiposPermitidos).toEqual(['data-comemorativa'])
  })

  it('data torta nao vira dia e mes', () => {
    expect(planejar(ev('compromisso_editado', {
      path: 'Agenda/x.md', data: '1990-13-40', comemorativa: true
    }))).toEqual([])
  })
})

/**
 * Corrigir o suplemento e a tarefa diaria pelo celular.
 *
 * Trocar a dose de um suplemento e o tipo de coisa que se decide na hora de
 * tomar, com o pote na mao -- e antes so dava para fazer no computador.
 */
describe('planejar — editar suplemento e tarefa diaria', () => {
  const editar = (dados: Record<string, unknown>) =>
    planejar(ev('compromisso_editado', { path: 'Saude/Whey.md', ...dados }))[0] as {
      acao: string; tiposPermitidos: string[]; campos: Record<string, unknown>
    }

  it('a dose e o momento viram campos da nota', () => {
    expect(editar({ dose: '30 g', quando: 'pós-treino' }).campos)
      .toEqual({ dose: '30 g', quando: 'pós-treino' })
  })

  it('os dias da semana passam item a item', () => {
    expect(editar({ dias: ['seg', 'qua', 'sex'] }).campos).toEqual({ dias: ['seg', 'qua', 'sex'] })
  })

  it('dia que o Cortex nao conhece e descartado', () => {
    // A comparacao e por texto: um `sáb` com acento faria o suplemento de
    // sabado nunca mais aparecer na tela.
    expect(editar({ dias: ['seg', 'sáb', 'lunes', 'qua'] }).campos).toEqual({ dias: ['seg', 'qua'] })
  })

  it('os dias saem sempre na ordem da semana, nao na ordem em que vieram', () => {
    expect(editar({ dias: ['sex', 'seg'] }).campos).toEqual({ dias: ['seg', 'sex'] })
  })

  it('dia repetido entra uma vez so', () => {
    expect(editar({ dias: ['seg', 'seg', 'SEG'] }).campos).toEqual({ dias: ['seg'] })
  })

  it('lista vazia nao apaga os dias -- ela some do evento', () => {
    // Apagar os dias por engano faria o suplemento sumir da tela sem que
    // ninguem tivesse pedido isso. "Todo dia" se diz nao mandando o campo.
    expect(planejar(ev('compromisso_editado', { path: 'Saude/Whey.md', dias: [] }))).toEqual([])
  })

  it('alcanca suplemento e rotina, alem dos quatro de antes', () => {
    expect(editar({ dose: '30 g' }).tiposPermitidos)
      .toEqual(['evento', 'prova', 'simulado', 'tarefa', 'anotacao', 'suplemento', 'rotina'])
  })

  it('um objeto disfarcado de dia nao entra no vault', () => {
    expect(planejar(ev('compromisso_editado', {
      path: 'Saude/Whey.md',
      dias: [{ dia: 'seg', motivo: 'SEGREDO-MOTIVO' }]
    }))).toEqual([])
  })
})
