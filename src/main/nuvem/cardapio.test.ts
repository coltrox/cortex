import { describe, it, expect } from 'vitest'
import type { NoteComCampos } from '../index/queries'
import { montarCardapio, podePublicarCorpo } from './cardapio'
import { TIPOS_NOTA_CARDAPIO } from '../../shared/eventos'

/**
 * Data fixa em vez do relogio: um teste que muda de resultado conforme o dia
 * em que roda e um teste que um dia falha sozinho na CI e ninguem entende.
 */
const HOJE = '2026-08-28'

/** Chama com o `hoje` fixo -- a maioria dos testes nao fala de data. */
const montar = (notas: Parameters<typeof montarCardapio>[0]) => montarCardapio(notas, HOJE, [])

const nota = (p: Partial<NoteComCampos> & { path: string }): NoteComCampos => ({
  path: p.path, title: p.title ?? p.path, tipo: p.tipo ?? 'nota',
  project: null, status: null, created: null, updated: null, date: p.date ?? null,
  mtime: 0, size: 0, parseError: null, campos: p.campos ?? {}
})

describe('montarCardapio', () => {
  it('publica o treino com exercicios, series e reps', () => {
    const c = montar([nota({
      path: 'Saude/Treinos/Push A.md', title: 'Push A', tipo: 'treino-modelo',
      campos: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8-10' }] }
    })])
    expect(c).toEqual([{
      especie: 'treino', nome: 'Push A',
      detalhe: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8-10' }] }
    }])
  })

  it('NAO publica a carga — ela e historico, nao estrutura', () => {
    const c = montar([nota({
      path: 't.md', title: 'Push A', tipo: 'treino-modelo',
      campos: { exercicios: [{ nome: 'Supino', series: 4, reps: '8', carga: '60 kg' }] }
    })])
    expect(JSON.stringify(c)).not.toContain('60 kg')
    expect(JSON.stringify(c)).not.toContain('carga')
  })

  it('publica suplemento com dose, quando e dias', () => {
    const c = montar([nota({
      path: 's.md', title: 'Whey', tipo: 'suplemento',
      campos: { dose: '30 g', quando: 'pós-treino', dias: ['seg', 'qua'], estoque: 42 }
    })])
    expect(c[0]).toEqual({
      especie: 'suplemento', nome: 'Whey',
      // O caminho vai junto: e a referencia que o celular devolve ao editar.
      detalhe: { path: 's.md', dose: '30 g', quando: 'pós-treino', dias: ['seg', 'qua'] }
    })
  })

  it('publica so as refeicoes do plano ATIVO', () => {
    const ativo = nota({
      path: 'a.md', title: 'Cutting', tipo: 'plano',
      campos: { ativo: true, refeicoes: [{ nome: 'Café', hora: '07:00', itens: '2 ovos', kcal: 400, prot: 30 }] }
    })
    const inativo = nota({
      path: 'b.md', title: 'Bulking', tipo: 'plano',
      campos: { refeicoes: [{ nome: 'Ceia', kcal: 900 }] }
    })
    const c = montar([ativo, inativo])
    expect(c.filter(i => i.especie === 'refeicao').map(i => i.nome)).toEqual(['Café'])
  })

  it('ignora tipos que nao sao cardapio', () => {
    const c = montar([
      nota({ path: 'x.md', tipo: 'sessao', campos: { modelo: 'Push A' } }),
      nota({ path: 'y.md', tipo: 'diario', campos: { transacoes: [{ item: 'Almoço', valor: 32 }] } })
    ])
    expect(c).toEqual([])
  })

  it('NADA sensivel do vault aparece no que sobe', () => {
    const vault = [
      nota({ path: 'Vida/Contas/Netflix.md', title: 'Netflix', tipo: 'conta',
             campos: { usuario: 'pedro@mail', senha: 'SENHA-SECRETA-123' } }),
      nota({ path: 'Vida/Documentos/RG.md', title: 'RG', tipo: 'documento',
             campos: { numero: '99.999.999-9' } }),
      nota({ path: 'Diario/2026-08-27.md', tipo: 'diario', date: '2026-08-27',
             campos: { transacoes: [{ item: 'Almoço', valor: 32.5, cat: 'alimentacao' }] } }),
      nota({ path: 'Saude/Treinos/s.md', title: 'Push A — 2026-08-27', tipo: 'sessao',
             campos: { modelo: 'Push A', exercicios: [{ nome: 'Supino', carga: '60 kg' }] } }),
      // Anotacao dentro da pasta das senhas. O corte normal e por TIPO, e
      // `anotacao` E um tipo que sobe -- entao so o corte por PASTA segura
      // esta. O nome dela ja entregaria o assunto, por isso nem o titulo sai.
      nota({ path: 'Vida/Contas/Wifi da mae.md', title: 'SEGREDO-TITULO-ANOTACAO',
             tipo: 'anotacao',
             campos: { texto: 'texto pessoal que nao pode vazar' } }),
      // e o que PODE subir — mas com campos sensíveis embutidos DENTRO dos três
      // tipos que montarCardapio de fato processa. Filtrar por tipo não basta
      // aqui: só passa quem também filtra campo a campo dentro do tipo certo.
      nota({ path: 'Saude/Treinos/Push A.md', title: 'Push A', tipo: 'treino-modelo',
             campos: {
               // grupo como array — String() de array junta com vírgula, então
               // um segundo item vaza grudado no primeiro se txt() não filtrar
               grupo: ['push', 'SEGREDO-ARRAY-GRUPO'],
               // campo extra no frontmatter do treino, fora da lista branca
               notaMedica: 'evitar por causa da cirurgia no ombro',
               exercicios: [{
                 nome: 'Supino', reps: '8',
                 // series e obs vêm como objeto — nem series pode ser copiado bruto,
                 // nem obs (chave que nem existe na lista branca) pode vazar
                 series: { valor: 4, obs: 'dor lombar recorrente' }
               }]
             } }),
      nota({ path: 'Saude/Suplementos/Whey.md', title: 'Whey', tipo: 'suplemento',
             campos: {
               // dose como array — mesma classe de furo que grupo acima
               dose: ['30 g', 'SEGREDO-DOSE-ARRAY'], quando: 'pós-treino',
               // dias mistura strings de verdade com um objeto disfarçado de dia
               dias: ['seg', 'qua', { dia: 'sex', motivo: 'combinar com consulta psiquiátrica dia 12' }],
               estoque: 42,
               receita: 'prescrito pelo psiquiatra dr. Fulano'
             } }),
      nota({ path: 'Saude/Planos/Cutting.md', title: 'Cutting', tipo: 'plano',
             campos: {
               ativo: true,
               refeicoes: [{
                 nome: 'Café', hora: '07:00',
                 // itens como array — mesma classe de furo, agora em refeicao
                 itens: ['2 ovos', 'SEGREDO-ITENS-ARRAY'], prot: 30,
                 // kcal também vem como objeto — mesma classe de furo que series
                 kcal: { valor: 600, obs: 'restrição renal detectada em exame recente' }
               }]
             } }),
      // title como array, em treino e suplemento — nome vinha de n.title direto,
      // sem passar por txt(). NoteRow.title é `string`, então isto exige cast:
      // hoje o indexer.ts sempre entrega string de verdade, e é só por isso que
      // o cast é necessário aqui. O ponto do teste não é "o frontmatter consegue
      // produzir isso" — é que montarCardapio não pode depender de uma garantia
      // que mora em outro arquivo para não vazar. Se o indexer mudar, ou se
      // montarCardapio for chamada por outro caminho que não garanta title
      // string, a função tem que se defender sozinha.
      nota({ path: 'Saude/Treinos/Titulo-Malicioso.md',
             title: ['Treino X', 'SEGREDO-TITLE-TREINO'] as unknown as string,
             tipo: 'treino-modelo',
             campos: { grupo: 'push' } }),
      nota({ path: 'Saude/Suplementos/Titulo-Malicioso.md',
             title: ['Whey X', 'SEGREDO-TITLE-SUPLEMENTO'] as unknown as string,
             tipo: 'suplemento',
             campos: { dose: '10 g' } })
    ]
    const json = JSON.stringify(montar(vault))

    expect(json).toContain('Push A')          // o cardápio não veio vazio
    /*
     * O gasto SAIU desta lista em 10/09/2026.
     *
     * `Almoço` e `32.5` são um lançamento do diário, e estavam proibidos por
     * uma decisão de privacidade: extrato não sobe. O dono levantou a
     * restrição — "os lancamentos podem sim fica tranquilo" — para o celular
     * poder mostrar a tela de Dinheiro com o gasto do mês e a lista do dia.
     *
     * O resto da lista continua igual, e é o que importa: senha, e-mail, CPF,
     * peso, texto pessoal, observação clínica e título de anotação em pasta
     * protegida NÃO entraram no acordo. Afrouxar um item não afrouxa os
     * outros, e é por isso que a mudança está comentada aqui em vez de o teste
     * ter sido apagado.
     */
    for (const proibido of [
      'SENHA-SECRETA-123', 'pedro@mail', '99.999.999-9',
      '60 kg', 'texto pessoal',
      'evitar por causa da cirurgia', 'dor lombar recorrente',
      'combinar com consulta psiquiátrica', 'prescrito pelo psiquiatra',
      'restrição renal detectada em exame recente',
      'SEGREDO-ARRAY-GRUPO', 'SEGREDO-DOSE-ARRAY', 'SEGREDO-ITENS-ARRAY',
      'SEGREDO-TITLE-TREINO', 'SEGREDO-TITLE-SUPLEMENTO',
      'SEGREDO-TITULO-ANOTACAO'
    ]) {
      expect(json).not.toContain(proibido)
    }
  })

  it('nao quebra com nota malformada', () => {
    const c = montar([nota({
      path: 't.md', title: 'Sem nada', tipo: 'treino-modelo', campos: { exercicios: 'nao e lista' }
    })])
    expect(c).toEqual([{ especie: 'treino', nome: 'Sem nada', detalhe: { exercicios: [] } }])
  })
})

/*
 * A fronteira depois da inversão.
 *
 * O combinado mudou: quase tudo sincroniza, e a Vida inteira fica no
 * computador. Um teste que só afirmasse "publica prova" passaria com uma
 * implementação que publicasse o vault todo — por isso o teste que importa é
 * este, o que falha quando algo de Vida aparece no que sobe.
 */
describe('a Vida nunca sobe', () => {
  const HOJE_2 = '2026-08-28'

  it('nenhum tipo de Vida vira item de cardapio, nem com data de hoje', () => {
    const vault = [
      nota({ path: 'Vida/Contas/Nubank.md', title: 'Nubank', tipo: 'conta', date: HOJE_2,
             campos: { agencia: '0001', numero: 'CONTA-99999-7', banco: 'Nubank' } }),
      nota({ path: 'Vida/Contas/Gmail.md', title: 'Gmail', tipo: 'senha', date: HOJE_2,
             campos: { usuario: 'pedro@mail', senha: 'SENHA-SECRETA-123' } }),
      nota({ path: 'Vida/Documentos/RG.md', title: 'RG', tipo: 'documento', date: HOJE_2,
             campos: { numero: '99.999.999-9', orgao: 'SSP', validade: '2030-01-01' } }),
      nota({ path: 'Vida/Compras/Tenis.md', title: 'Tenis', tipo: 'compra', date: HOJE_2,
             campos: { valor: 499.9, loja: 'LOJA-SECRETA' } }),
      nota({ path: 'Vida/Pessoas/Ana.md', title: 'Ana', tipo: 'pessoa', date: HOJE_2,
             campos: { telefone: '11-99999-0000', nota: 'CONTEUDO-PESSOAL' } }),
      // Uma prova de verdade junto, senão o teste passaria com um cardápio
      // vazio e não teria provado nada.
      nota({ path: 'Estudos/Provas/ENEM.md', title: 'ENEM', tipo: 'prova', date: HOJE_2,
             campos: { materia: 'humanas' } })
    ]
    const json = JSON.stringify(montarCardapio(vault, HOJE_2, []))

    expect(json).toContain('ENEM')  // o cardápio não veio vazio
    for (const proibido of [
      'CONTA-99999-7', 'SENHA-SECRETA-123', 'pedro@mail', '99.999.999-9',
      'LOJA-SECRETA', 'CONTEUDO-PESSOAL', '11-99999-0000', '499.9',
      // Os tipos, não só os valores: se um deles aparecer, alguém abriu a
      // porta para a espécie inteira.
      'conta', 'senha', 'documento', 'compra', 'pessoa'
    ]) {
      expect(json).not.toContain(proibido)
    }
  })
})

describe('o que esta chegando', () => {
  const HOJE_3 = '2026-08-28'

  it('publica a prova com data, materia e o caminho de volta', () => {
    const c = montarCardapio([nota({
      path: 'Estudos/Provas/ENEM.md', title: 'ENEM 1o dia', tipo: 'prova',
      date: '2026-09-10', campos: { materia: 'linguagens', local: 'UFPR' }
    })], HOJE_3, [])
    expect(c).toEqual([{
      especie: 'prova', nome: 'ENEM 1o dia',
      // `path` sobe porque é como o celular devolve a referência ao dizer
      // "estudei esta" — comparar por título casaria provas de nome parecido.
      detalhe: { path: 'Estudos/Provas/ENEM.md', data: '2026-09-10',
                 materia: 'linguagens', local: 'UFPR' }
    }])
  })

  it('marca a prova ja estudada', () => {
    const c = montarCardapio([nota({
      path: 'p.md', title: 'P1', tipo: 'prova', date: '2026-09-10',
      campos: { estudado: true }
    })], HOJE_3, [])
    expect(c[0].detalhe.estudado).toBe(true)
  })

  it('so `estudado: true` conta -- string "sim" nao vira marcado', () => {
    const c = montarCardapio([nota({
      path: 'p.md', title: 'P1', tipo: 'prova', date: '2026-09-10',
      campos: { estudado: 'sim' }
    })], HOJE_3, [])
    expect(c[0].detalhe.estudado).toBeUndefined()
  })

  it('publica simulado como prova', () => {
    const c = montarCardapio([nota({
      path: 's.md', title: 'Simulado 3', tipo: 'simulado', date: '2026-09-01'
    })], HOJE_3, [])
    expect(c[0].especie).toBe('prova')
  })

  it('publica compromisso com hora e local', () => {
    const c = montarCardapio([nota({
      path: 'Agenda/Dentista.md', title: 'Dentista', tipo: 'evento',
      date: '2026-08-30', campos: { hora: '14:00', local: 'Centro' }
    })], HOJE_3, [])
    expect(c).toEqual([{
      especie: 'compromisso', nome: 'Dentista',
      detalhe: { path: 'Agenda/Dentista.md', data: '2026-08-30', hora: '14:00', local: 'Centro' }
    }])
  })

  it('compromisso cancelado nao vai para o celular', () => {
    // Ele já sumiu da agenda aqui; mandá-lo daria ao celular um botão de
    // cancelar o que não existe mais.
    const c = montarCardapio([nota({
      path: 'a.md', title: 'Reuniao', tipo: 'evento', date: '2026-08-30',
      campos: { cancelado: true }
    })], HOJE_3, [])
    expect(c).toEqual([])
  })

  it('publica tarefa com prazo', () => {
    const c = montarCardapio([nota({
      path: 'Estudos/Trabalho.md', title: 'Trabalho de historia', tipo: 'tarefa',
      date: '2026-09-05', campos: { materia: 'historia' }
    })], HOJE_3, [])
    expect(c[0]).toEqual({
      especie: 'tarefa', nome: 'Trabalho de historia',
      detalhe: { path: 'Estudos/Trabalho.md', prazo: '2026-09-05', materia: 'historia' }
    })
  })

  it('nao publica o que ja passou ha mais de dois dias', () => {
    // Publicar o histórico encheria a tela do celular com prova de 2023, e o
    // banco junto.
    const antiga = nota({ path: 'v.md', title: 'Velha', tipo: 'prova', date: '2026-08-01' })
    expect(montarCardapio([antiga], HOJE_3, [])).toEqual([])
  })

  it('publica o que passou ontem -- marcar "estudei" acontece depois do fato', () => {
    const ontem = nota({ path: 'o.md', title: 'Ontem', tipo: 'prova', date: '2026-08-27' })
    expect(montarCardapio([ontem], HOJE_3, [])).toHaveLength(1)
  })

  it('nota sem data nao entra -- nao da para saber se esta chegando', () => {
    const semData = nota({ path: 'x.md', title: 'Sem data', tipo: 'prova', date: null })
    expect(montarCardapio([semData], HOJE_3, [])).toEqual([])
  })
})

describe('a lista de tipos que alimenta o cardapio', () => {
  it('cobre todo tipo de nota que montarCardapio le', () => {
    // Este teste existe por um defeito real: App.tsx observava so tres destes
    // tipos para decidir republicar, entao criar uma prova ou um compromisso
    // no Cortex nao mandava nada para o celular -- a novidade so aparecia
    // quando, por acaso, um treino fosse editado depois. Agora ha uma lista
    // so, e ela precisa continuar cobrindo tudo que a funcao consulta.
    // `diario` entrou por outro motivo: nao vira item de cardapio, e sim diz
    // o que JA foi marcado hoje. Sem ele, desmarcar um suplemento no Cortex
    // nao chegava ao celular -- o check de la vivia so na memoria do aparelho.
    // `hidratacao` diz a meta e o tamanho da garrafa; o total bebido vem do
    // `diario`, logo acima. Sao dois tipos para uma secao so na tela.
    expect([...TIPOS_NOTA_CARDAPIO].sort()).toEqual([
      'anotacao', 'data-comemorativa', 'diario', 'evento', 'hidratacao', 'meta-cofre', 'plano',
      'porquinho', 'prova', 'rotina', 'simulado', 'suplemento', 'tarefa',
      'treino-modelo'
    ])
  })

  it('cada tipo da lista consegue virar item', () => {
    const HOJE = '2026-09-01'
    const porTipo: Record<string, unknown> = {
      'treino-modelo': nota({ path: 'a.md', title: 'T', tipo: 'treino-modelo' }),
      suplemento: nota({ path: 'b.md', title: 'S', tipo: 'suplemento' }),
      prova: nota({ path: 'c.md', title: 'P', tipo: 'prova', date: '2026-09-10' }),
      simulado: nota({ path: 'd.md', title: 'Si', tipo: 'simulado', date: '2026-09-10' }),
      evento: nota({ path: 'e.md', title: 'E', tipo: 'evento', date: '2026-09-10' }),
      tarefa: nota({ path: 'f.md', title: 'Ta', tipo: 'tarefa', date: '2026-09-10' }),
      rotina: nota({ path: 'h.md', title: 'Abdomen', tipo: 'rotina' }),
      hidratacao: nota({ path: 'i.md', title: 'Agua', tipo: 'hidratacao', campos: { meta: 3500 } }),
      'data-comemorativa': nota({
        path: 'k.md', title: 'Aniversario da mae', tipo: 'data-comemorativa',
        campos: { dia: 20, mes: 12, ano: 1970 }
      }),
      anotacao: nota({
        path: 'j.md', title: 'Passou o dia', tipo: 'anotacao', date: HOJE,
        campos: { texto: 'Passou o dia' }
      })
    }
    for (const [tipo, n] of Object.entries(porTipo)) {
      const c = montarCardapio([n as never], HOJE, [])
      expect(c.length, tipo + ' nao virou item').toBeGreaterThan(0)
    }
    // Tres excecoes ao laco acima, porque nao viram um item cada:
    // `plano` fornece as refeicoes, e `porquinho`/`meta-cofre` juntos viram
    // UM item com o saldo somado.
    const comPorquinho = montarCardapio([
      nota({ path: 'm1.md', title: 'Guardei', tipo: 'porquinho', campos: { valor: 100, direcao: 'deposito' } }),
      nota({ path: 'm2.md', title: 'Tirei', tipo: 'porquinho', campos: { valor: 30, direcao: 'sangria' } }),
      nota({ path: 'meta.md', title: 'Notebook', tipo: 'meta-cofre', campos: { ativa: true, alvo: 4000 } })
    ], HOJE, [])
    expect(comPorquinho).toHaveLength(1)
    expect(comPorquinho[0]).toEqual({
      especie: 'porquinho', nome: 'Notebook', detalhe: { saldo: 70, alvo: 4000 }
    })

    // `plano` e a excecao: ele nao vira item, ele fornece as refeicoes.
    const comPlano = montarCardapio([nota({
      path: 'g.md', title: 'Plano', tipo: 'plano',
      campos: { ativo: true, refeicoes: [{ nome: 'Cafe', hora: '07:00' }] }
    })], HOJE, [])
    expect(comPlano.map(i => i.especie)).toEqual(['refeicao'])
  })
})

/**
 * O que ja foi marcado hoje.
 *
 * Existe por um defeito de desenho: o check do celular vivia so na memoria do
 * proprio aparelho, entao desmarcar um suplemento no Cortex nao chegava la --
 * as duas telas divergiam em silencio ate a virada do dia.
 */
describe('o que ja foi feito hoje sobe junto', () => {
  const HOJE = '2026-09-01'
  const creatina = nota({
    path: 'Saude/Creatina.md', title: 'Creatina', tipo: 'suplemento',
    campos: { dose: '6 g' }
  })
  const diario = (campos: Record<string, unknown>) =>
    nota({ path: `Diario/${HOJE}.md`, title: HOJE, tipo: 'diario', date: HOJE, campos })

  const so = (itens: ReturnType<typeof montarCardapio>) =>
    itens.find(i => i.especie === 'suplemento')

  it('marca o suplemento que esta no diario de hoje', () => {
    const c = montarCardapio([creatina, diario({ suplementos_feitos: ['Creatina'] })], HOJE, [])
    expect(so(c)?.detalhe.feito).toBe(true)
  })

  it('sem diario, o campo nem existe -- e nao `feito: false`', () => {
    // `comValor` tira o undefined: um `feito: false` em todo item seria uma
    // chave a mais em cada linha que sobe, dizendo o padrao.
    const c = montarCardapio([creatina], HOJE, [])
    expect(so(c)?.detalhe).not.toHaveProperty('feito')
  })

  it('o diario de OUTRO dia nao marca nada', () => {
    // O cardapio e do dia de hoje. Ler o de ontem faria o celular abrir com
    // tudo marcado toda manha.
    const ontem = nota({
      path: 'Diario/2026-08-31.md', title: '2026-08-31', tipo: 'diario',
      date: '2026-08-31', campos: { suplementos_feitos: ['Creatina'] }
    })
    const c = montarCardapio([creatina, ontem], HOJE, [])
    expect(so(c)?.detalhe).not.toHaveProperty('feito')
  })

  it('o texto solto do diario nao sobe -- so os campos declarados', () => {
    /*
     * Este teste é o que impede alguém de trocar a lista branca por um spread
     * mais tarde. O que ele trava mudou em 10/09/2026: o gasto passou a poder
     * subir, por decisão do dono, e por isso ele agora aparece como espécie
     * própria. O texto solto do diário continua fora — é lá que mora o que a
     * pessoa escreveu sobre o próprio dia.
     */
    const c = montarCardapio([creatina, diario({
      suplementos_feitos: ['Creatina'],
      gastos: [{ item: 'GASTO-DO-DIA', valor: 99 }],
      anotacao: 'SEGREDO-ANOTACAO'
    })], HOJE, [])
    const json = JSON.stringify(c)
    expect(json).not.toContain('SEGREDO-ANOTACAO')
    // E o gasto sobe, como espécie declarada e não como respingo do diário.
    const t = c.filter(i => i.especie === 'transacao')
    expect(t).toHaveLength(1)
    expect(t[0].detalhe).toMatchObject({ item: 'GASTO-DO-DIA', valor: 99, dir: 'saida' })
  })

  it('a lista antiga `gastos` e sempre saida, mesmo com dir entrada', () => {
    // Aquela lista nasceu antes de existir entrada. Sem esta regra, um gasto
    // de 2025 entraria como receita na soma do celular.
    const c = montarCardapio([diario({
      gastos: [{ item: 'X', valor: 10, dir: 'entrada' }]
    })], HOJE, [])
    expect(c.find(i => i.especie === 'transacao')?.detalhe.dir).toBe('saida')
  })

  it('medida e cardio sobem com a data como chave', () => {
    const c = montarCardapio([
      nota({ path: 'Saude/2026-09-10.md', title: '2026-09-10', tipo: 'medida',
             date: '2026-09-10', campos: { peso: 62.4, cintura: 71 } }),
      nota({ path: 'Saude/Treinos/2026-09-10.md', title: 'c', tipo: 'cardio',
             date: '2026-09-10', campos: { aparelho: 'esteira', minutos: 30 } })
    ], HOJE, [])
    expect(c.find(i => i.especie === 'medida')?.detalhe)
      .toMatchObject({ data: '2026-09-10', peso: 62.4, cintura: 71 })
    // Data mais aparelho: correr de manhã e pedalar à noite são dois itens.
    expect(c.find(i => i.especie === 'cardio')?.nome).toBe('2026-09-10 esteira')
  })

  it('marca a refeicao do plano ativo', () => {
    const plano = nota({
      path: 'Saude/Dieta/Plano.md', title: 'Plano', tipo: 'plano',
      campos: { ativo: true, refeicoes: [{ nome: 'Café da manhã', hora: '07:00' }] }
    })
    const c = montarCardapio([plano, diario({ dieta_feitas: ['Café da manhã'] })], HOJE, [])
    expect(c.find(i => i.especie === 'refeicao')?.detalhe.feito).toBe(true)
  })

  it('publica a posicao de cada refeicao no plano -- o banco devolve em ordem alfabetica', () => {
    // Plano de nutricionista quase nunca tem hora em todas: sem a posicao, o
    // celular nao tem como saber que "Ao acordar" vem antes do almoco.
    const plano = nota({
      path: 'Saude/Dieta/Plano.md', title: 'Plano', tipo: 'plano',
      campos: { ativo: true, refeicoes: [
        { nome: 'Ao acordar' }, { nome: '1ª refeição', hora: '10:00' }, { nome: 'Almoço' }
      ] }
    })
    const c = montarCardapio([plano], HOJE, []).filter(i => i.especie === 'refeicao')
    expect(c.map(i => [i.nome, i.detalhe.ordem])).toEqual([
      ['Ao acordar', 0], ['1ª refeição', 1], ['Almoço', 2]
    ])
  })
})

describe('a anotacao do dia volta para o celular', () => {
  const HOJE4 = '2026-09-04'
  const anotacao = (p: { path: string; title: string; date: string | null; campos?: Record<string, unknown> }) =>
    nota({ path: p.path, title: p.title, tipo: 'anotacao', date: p.date, campos: p.campos })

  it('publica texto e caminho de volta', () => {
    const c = montarCardapio([anotacao({
      path: 'Vida/Fui bem no simulado.md', title: 'Fui bem no simulado',
      date: HOJE4, campos: { texto: 'Fui bem no simulado\nErrei duas de humanas' }
    })], HOJE4, [])
    expect(c).toEqual([{
      especie: 'anotacao', nome: 'Fui bem no simulado',
      detalhe: {
        path: 'Vida/Fui bem no simulado.md',
        // A data VIAJA agora: e com ela que a tela do celular separa o
        // recado de hoje do de semana passada.
        data: HOJE4,
        texto: 'Fui bem no simulado\nErrei duas de humanas'
      }
    }])
  })

  it('a marca de prioridade so aparece quando e verdade', () => {
    const comum = montarCardapio([anotacao({
      path: 'a.md', title: 'Dormi mal', date: HOJE4, campos: { texto: 'Dormi mal' }
    })], HOJE4, [])
    // Nem `prioridade: false`: seria uma linha em todo item do cardapio para
    // o celular so ignorar.
    expect(comum[0].detalhe).not.toHaveProperty('prioridade')

    const marcada = montarCardapio([anotacao({
      path: 'b.md', title: 'Ligar pro dentista', date: HOJE4,
      campos: { texto: 'Ligar pro dentista', prioridade: true }
    })], HOJE4, [])
    expect(marcada[0].detalhe.prioridade).toBe(true)
  })

  it('TODAS sobem, cada uma com a sua data', () => {
    // O corte por dia saiu daqui de proposito. Antes so subia a de hoje, e o
    // celular era uma janela para o dia: a anotacao de terca sumia na quarta
    // mesmo continuando no vault. Agora sobem todas, e quem escolhe o que
    // mostrar e a TELA -- o Hoje corta pelo dia, a tela Notas mostra tudo.
    const ontem = anotacao({ path: 'c.md', title: 'Ontem', date: '2026-09-03', campos: { texto: 'Ontem' } })
    const hoje = anotacao({ path: 'd.md', title: 'Hoje', date: HOJE4, campos: { texto: 'Hoje' } })
    const semData = anotacao({ path: 'e.md', title: 'Sem data', date: null, campos: { texto: 'Sem data' } })

    const c = montarCardapio([ontem, hoje, semData], HOJE4, [])
    expect(c.map(i => i.nome).sort()).toEqual(['Hoje', 'Ontem', 'Sem data'])
    expect(c.find(i => i.nome === 'Ontem')?.detalhe.data).toBe('2026-09-03')
    expect(c.find(i => i.nome === 'Hoje')?.detalhe.data).toBe(HOJE4)
    // Sem data continua sendo a permanente: nao e registro do dia, e coisa
    // para consultar, e a tela do Hoje mostra ela todo dia.
    expect(c.find(i => i.nome === 'Sem data')?.detalhe.permanente).toBe(true)
    expect(c.find(i => i.nome === 'Sem data')?.detalhe).not.toHaveProperty('data')
    expect(c.find(i => i.nome === 'Hoje')?.detalhe).not.toHaveProperty('permanente')
  })

  it('permanente primeiro, depois da mais nova para a mais velha', () => {
    // A ordem e a do teto de 300: se um dia houver anotacao demais, o que se
    // perde e a mais antiga, nunca a que fica.
    const c = montarCardapio([
      anotacao({ path: 'a.md', title: 'Velha', date: '2026-01-01', campos: { texto: 'x' } }),
      anotacao({ path: 'b.md', title: 'Nova', date: HOJE4, campos: { texto: 'x' } }),
      anotacao({ path: 'c.md', title: 'Fixa', date: null, campos: { texto: 'x' } })
    ], HOJE4, [])
    expect(c.map(i => i.nome)).toEqual(['Fixa', 'Nova', 'Velha'])
  })

  it('sem o campo texto, o titulo salva a linha', () => {
    // O titulo E a primeira linha da anotacao (ver `planejar.ts`), entao ele
    // e a melhor aproximacao quando `texto` faltar -- melhor do que publicar
    // um item cujo conteudo e uma string vazia.
    const c = montarCardapio([anotacao({ path: 'f.md', title: 'So o titulo', date: HOJE4 })], HOJE4, [])
    expect(c[0].detalhe).not.toHaveProperty('texto')
    expect(c[0].nome).toBe('So o titulo')
  })
})

describe('a tarefa diaria sobe como especie propria', () => {
  const HOJE2 = '2026-09-01'
  const rotina = nota({
    path: 'Vida/Agua.md', title: 'Tomar 3 L de agua', tipo: 'rotina',
    campos: { quando: 'manhã', dias: ['seg', 'qua'] }
  })

  it('publica com quando e dias', () => {
    const c = montarCardapio([rotina], HOJE2, [])
    expect(c).toEqual([{
      especie: 'rotina', nome: 'Tomar 3 L de agua',
      detalhe: { path: 'Vida/Agua.md', quando: 'manhã', dias: ['seg', 'qua'] }
    }])
  })

  it('marca a que ja esta no diario de hoje', () => {
    const diario = nota({
      path: `Diario/${HOJE2}.md`, title: HOJE2, tipo: 'diario', date: HOJE2,
      campos: { rotinas_feitas: ['Tomar 3 L de agua'] }
    })
    expect(montarCardapio([rotina, diario], HOJE2, [])[0].detalhe.feito).toBe(true)
  })

  it('o conjunto dos suplementos NAO marca a rotina', () => {
    // Sao conjuntos separados de proposito. Se um dia alguem unificar os dois
    // campos, este teste e o que avisa.
    const diario = nota({
      path: `Diario/${HOJE2}.md`, title: HOJE2, tipo: 'diario', date: HOJE2,
      campos: { suplementos_feitos: ['Tomar 3 L de agua'] }
    })
    expect(montarCardapio([rotina, diario], HOJE2, [])[0].detalhe).not.toHaveProperty('feito')
  })

  it('e uma especie diferente de `tarefa`', () => {
    // A `tarefa` tem prazo e vive na aba Chegando; a rotina se repete e vive
    // no Hoje. Publicar as duas sob o mesmo nome faria uma tela mostrar a
    // outra.
    const tarefa = nota({
      path: 'Estudos/Trabalho.md', title: 'Trabalho de historia', tipo: 'tarefa',
      date: HOJE2, campos: { materia: 'historia' }
    })
    const especies = montarCardapio([rotina, tarefa], HOJE2, []).map(i => i.especie).sort()
    expect(especies).toEqual(['rotina', 'tarefa'])
  })
})

/**
 * A agua nao e um check: e um numero que sobe.
 *
 * A nota guarda o alvo (`meta`) e o tamanho da garrafa (`copo`); o total do
 * dia vem do diario. Sao coisas de arquivos diferentes que o celular recebe
 * juntas -- e e aqui que se juntam.
 */
describe('hidratacao', () => {
  const HOJE3 = '2026-09-03'
  const nascente = nota({
    path: 'Saude/Hidratacao.md', title: 'Água', tipo: 'hidratacao',
    campos: { meta: 3500, copo: 800 }
  })

  it('publica meta e copo, e o total de hoje', () => {
    const diario = nota({
      path: `Diario/${HOJE3}.md`, title: HOJE3, tipo: 'diario', date: HOJE3,
      campos: { agua_ml: 1600 }
    })
    expect(montarCardapio([nascente, diario], HOJE3, [])).toEqual([{
      especie: 'hidratacao', nome: 'Água',
      detalhe: { meta: 3500, copo: 800, ml: 1600 }
    }])
  })

  it('sem nada bebido, `ml` nao vai -- e ausencia, nao zero', () => {
    expect(montarCardapio([nascente], HOJE3, [])[0].detalhe).not.toHaveProperty('ml')
  })

  it('o total e o de HOJE, nao o de ontem', () => {
    // O celular pergunta "quanto falta agora". O diario de ontem responderia
    // outra coisa, e a barra abriria o dia ja cheia.
    const ontem = nota({
      path: 'Diario/2026-09-02.md', title: 'ontem', tipo: 'diario',
      date: '2026-09-02', campos: { agua_ml: 3500 }
    })
    expect(montarCardapio([nascente, ontem], HOJE3, [])[0].detalhe).not.toHaveProperty('ml')
  })

  it('sem a nota, nao ha secao de hidratacao', () => {
    // O diario sozinho nao inventa a nascente: sem meta e sem copo nao ha
    // botao que se possa desenhar.
    const diario = nota({
      path: `Diario/${HOJE3}.md`, title: HOJE3, tipo: 'diario', date: HOJE3,
      campos: { agua_ml: 800 }
    })
    expect(montarCardapio([diario], HOJE3, [])).toEqual([])
  })

  it('NAO leva junto o resto do diario', () => {
    // O diario e o arquivo mais intimo do vault: gasto, peso, anotacao do dia.
    // So `agua_ml` atravessa.
    const diario = nota({
      path: `Diario/${HOJE3}.md`, title: HOJE3, tipo: 'diario', date: HOJE3,
      campos: { agua_ml: 800, peso: 78.4, anotacao: 'briga com o chefe' }
    })
    const json = JSON.stringify(montarCardapio([nascente, diario], HOJE3, []))
    expect(json).not.toContain('chefe')
    expect(json).not.toContain('78.4')
  })
})

describe('as etapas do vestibular sobem para o celular', () => {
  const HOJE5 = '2026-09-07'
  const prova = (campos: Record<string, unknown>) => nota({
    path: 'Estudos/Provas/Unicamp.md', title: 'Unicamp 1a fase', tipo: 'prova',
    date: '2026-10-18', campos
  })

  it('sem `inscricao`, o celular nao ganha etapa nenhuma', () => {
    // Prova de cursinho continua com o "estudei" de sempre: publicar tres
    // campos vazios so para a tela decidir nao usa-los seria peso a toa.
    const d = montarCardapio([prova({ materia: 'geral' })], HOJE5, [])[0].detalhe
    expect(d).not.toHaveProperty('inscricao')
    expect(d).not.toHaveProperty('inscrito')
    expect(d).not.toHaveProperty('pago')
  })

  it('`inscricao: true` sobe, e e o que liga o fluxo na tela', () => {
    const d = montarCardapio([prova({ inscricao: true })], HOJE5, [])[0].detalhe
    expect(d.inscricao).toBe(true)
  })

  it('inscrito e pago sobem so quando sao verdade', () => {
    const meio = montarCardapio([prova({ inscricao: true, inscrito: true })], HOJE5, [])[0].detalhe
    expect(meio.inscrito).toBe(true)
    expect(meio).not.toHaveProperty('pago')

    const fim = montarCardapio(
      [prova({ inscricao: true, inscrito: true, pago: true })], HOJE5, []
    )[0].detalhe
    expect(fim.pago).toBe(true)
  })

  it('a DATA de cada etapa nao sobe', () => {
    // `inscrito_em` e `pago_em` ficam no vault. O celular so precisa saber SE
    // foi feito para desenhar a etapa da vez; quando foi nao muda nada na
    // tela, e cada campo que sobe e um campo a mais no banco.
    const d = montarCardapio([prova({
      inscricao: true, inscrito: true, inscrito_em: '2026-09-01',
      pago: true, pago_em: '2026-09-02'
    })], HOJE5, [])[0].detalhe
    expect(d).not.toHaveProperty('inscrito_em')
    expect(d).not.toHaveProperty('pago_em')
  })

  it('valor torto nao vira `true`', () => {
    // O frontmatter e escrito a mao: `inscricao: sim` nao pode ligar o fluxo
    // por acidente, porque a comparacao e estrita.
    const d = montarCardapio([prova({ inscricao: 'sim', inscrito: 1 })], HOJE5, [])[0].detalhe
    expect(d).not.toHaveProperty('inscricao')
    expect(d).not.toHaveProperty('inscrito')
  })
})

describe('o corpo da nota, que agora sobe', () => {
  const HOJE6 = '2026-09-07'

  it('rotina leva o corpo junto', () => {
    // O caso que motivou: tarefas com passo a passo e link de audio ficavam
    // presas no computador, e o celular mostrava so o nome.
    const c = montarCardapio([{
      ...nota({ path: 'Vida/Oracao.md', title: 'Oracao da manha', tipo: 'rotina' }),
      corpo: '1. Respirar\n2. Ouvir [o audio](https://exemplo.com/a.mp3)'
    }], HOJE6, [])
    expect(c[0].detalhe.corpo).toContain('Ouvir [o audio]')
  })

  it('anotacao SEM data sobe, e vem marcada como fixa', () => {
    // Antes o filtro era `date === hoje`, e anotacao permanente nao tem data:
    // ela nunca casava, e o celular jamais a via.
    const c = montarCardapio([nota({
      path: 'Vida/Wifi.md', title: 'Senha do wifi do cursinho', tipo: 'anotacao',
      campos: { texto: 'Senha do wifi do cursinho' }
    })], HOJE6, [])
    expect(c).toHaveLength(1)
    expect(c[0].detalhe.permanente).toBe(true)
  })

  it('anotacao de OUTRO dia sobe, e leva a data para a tela cortar', () => {
    // Mudou: o corte por dia era feito aqui e passou para a tela. O que o
    // publicador garante e que a data VAI JUNTO -- sem ela o celular
    // receberia tudo misturado e nao teria como voltar a mostrar so o dia.
    const c = montarCardapio([nota({
      path: 'Vida/a.md', title: 'De ontem', tipo: 'anotacao', date: '2026-09-06',
      campos: { texto: 'De ontem' }
    })], HOJE6, [])
    expect(c).toHaveLength(1)
    expect(c[0].detalhe.data).toBe('2026-09-06')
  })

  it('a de hoje sobe, e nao e marcada como fixa', () => {
    const c = montarCardapio([nota({
      path: 'Vida/b.md', title: 'Hoje', tipo: 'anotacao', date: HOJE6,
      campos: { texto: 'Hoje' }
    })], HOJE6, [])
    expect(c).toHaveLength(1)
    expect(c[0].detalhe).not.toHaveProperty('permanente')
  })

  it('corpo gigante e cortado, com aviso', () => {
    const c = montarCardapio([{
      ...nota({ path: 'Vida/r.md', title: 'R', tipo: 'rotina' }),
      corpo: 'x'.repeat(20000)
    }], HOJE6, [])
    const corpo = c[0].detalhe.corpo as string
    expect(corpo.length).toBeLessThan(20000)
    expect(corpo).toContain('cortado')
  })

  it('corpo so de espaco nao vira campo', () => {
    const c = montarCardapio([{
      ...nota({ path: 'Vida/r.md', title: 'R', tipo: 'rotina' }),
      corpo: '\n\n   \n'
    }], HOJE6, [])
    expect(c[0].detalhe).not.toHaveProperty('corpo')
  })
})

describe('quem pode ter o corpo publicado', () => {
  it('so rotina', () => {
    // Corpo e texto livre: o que cabe ali e qualquer coisa, e por isso a
    // lista se decide num lugar so.
    expect(podePublicarCorpo('rotina', 'Vida/x.md')).toBe(true)
    for (const t of ['conta', 'documento', 'diario', 'prova', 'treino-modelo', 'compra', null]) {
      expect(podePublicarCorpo(t, 'Vida/x.md'), t + ' nao pode').toBe(false)
    }
  })

  it('anotacao NAO publica corpo', () => {
    // Pedido do dono em 11/09/2026: "essa e a estrutura de uma anotacao, nao
    // e para mostrar o que tem dentro da nota e ponto final". A anotacao do
    // celular e uma linha, e o conteudo mora no proprio titulo; o corpo do
    // arquivo e so o rodape de links que o app escreve em toda nota nova.
    expect(podePublicarCorpo('anotacao', 'Vida/x.md')).toBe(false)
    expect(podePublicarCorpo('anotacao', 'Diario/2026-09-11.md')).toBe(false)
  })

  it('rotina nao escapa da pasta protegida', () => {
    // O tipo e escolhido no formulario; a pasta e onde o arquivo esta. Uma
    // rotina salva em Vida/Contas passaria pelo corte por tipo.
    expect(podePublicarCorpo('rotina', 'Vida/Contas/Banco.md')).toBe(false)
    expect(podePublicarCorpo('rotina', 'Vida/Documentos/RG.md')).toBe(false)
  })

  it('barra invertida do Windows nao dribla a regra', () => {
    expect(podePublicarCorpo('anotacao', 'Vida\\Contas\\Banco.md')).toBe(false)
  })

  it('pasta de nome parecido nao e a protegida', () => {
    // `Vida/Contaspublicas` comeca igual, mas nao e `Vida/Contas/`.
    expect(podePublicarCorpo('rotina', 'Vida/Contaspublicas/x.md')).toBe(true)
  })
})

// Os testes da regra em si vivem em src/shared/corpo.test.ts, junto da
// funcao. Aqui fica so o que e sobre o PUBLICADOR: que o corpo que sobe ja
// sai limpo.
describe('o corpo publicado ja sai limpo', () => {
  it('a rotina que sobe nao leva o bloco de links junto', () => {
    // O teste que importa: nao e a funcao isolada, e o que de fato viaja
    // para o celular.
    const c = montar([{
      ...nota({ path: 'Vida/Escada 30 min.md', title: 'Escada 30 min', tipo: 'rotina' }),
      corpo: '### Dependencias da Rede\n- [[Esteira 30 min]]\n\n---\n\nTrinta minutos.'
    }])
    expect(c).toEqual([{
      especie: 'rotina', nome: 'Escada 30 min',
      detalhe: { path: 'Vida/Escada 30 min.md', dias: [], corpo: 'Trinta minutos.' }
    }])
  })

  it('rotina que so tem o bloco de links sobe sem corpo nenhum', () => {
    // Sem isto o celular ganharia uma seta de abrir que abre o vazio.
    const c = montar([{
      ...nota({ path: 'Vida/x.md', title: 'X', tipo: 'rotina' }),
      corpo: '### Dependencias da Rede\n- [[A]]\n'
    }])
    expect(c).toEqual([{
      especie: 'rotina', nome: 'X', detalhe: { path: 'Vida/x.md', dias: [] }
    }])
  })
})

describe('as areas ligadas viajam para o celular', () => {
  it('cada area vira um item proprio', () => {
    // Um item por area, e nao uma lista dentro de um item: o cardapio e uma
    // tabela com chave (especie, nome) no banco, e uma lista dentro de
    // `detalhe` viraria uma linha so, que se sobrescreve.
    const c = montarCardapio([], HOJE, ['saude', 'conhecimento'])
    expect(c).toEqual([
      { especie: 'area', nome: 'saude', detalhe: {} },
      { especie: 'area', nome: 'conhecimento', detalhe: {} }
    ])
  })

  it('sem area ligada, nenhum item de area sobe', () => {
    // E o celular le isso como "nao sei" e mostra tudo -- ver `areasLigadas`
    // no app web. Ausencia nao pode significar "desligue tudo".
    expect(montarCardapio([], HOJE, [])).toEqual([])
  })

  it('a area nao mistura com o conteudo', () => {
    const c = montarCardapio([nota({
      path: 's.md', title: 'Whey', tipo: 'suplemento', campos: { dose: '30 g' }
    })], HOJE, ['saude'])
    expect(c.filter(i => i.especie === 'area').map(i => i.nome)).toEqual(['saude'])
    expect(c.filter(i => i.especie === 'suplemento').map(i => i.nome)).toEqual(['Whey'])
  })
})

/**
 * A data comemorativa, publicada como compromisso.
 *
 * Especie `compromisso`, e nao uma nova: o celular ja sabe desenhar
 * compromisso, e especie nova precisaria entrar na lista branca de
 * `publicar_cardapio` -- o que obrigaria a rodar o SQL do Supabase de novo.
 */
describe('data comemorativa no cardapio', () => {
  const HOJE = '2026-09-11'
  const aniversario = (campos: Record<string, unknown>) => nota({
    path: 'Agenda/Mae.md', title: 'Aniversário da mãe',
    tipo: 'data-comemorativa', campos
  })

  it('sobe com a PROXIMA ocorrencia, e nao com dia e mes crus', () => {
    // Mandar dia e mes obrigaria o celular a refazer a conta, e as duas
    // pontas divergiriam no primeiro 29 de fevereiro.
    const [i] = montarCardapio([aniversario({ dia: 20, mes: 9, ano: 1970 })], HOJE, [])
    expect(i).toMatchObject({
      especie: 'compromisso', nome: 'Aniversário da mãe',
      detalhe: { data: '2026-09-20', comemorativa: true, anos: 56 }
    })
  })

  it('sem o ano de origem, nao inventa quantos anos faz', () => {
    const [i] = montarCardapio([aniversario({ dia: 20, mes: 9 })], HOJE, [])
    expect((i as { detalhe: Record<string, unknown> }).detalhe).not.toHaveProperty('anos')
  })

  it('a que ja passou este ano cai no ano que vem', () => {
    const [i] = montarCardapio([aniversario({ dia: 3, mes: 1 })], HOJE, [])
    expect(i).toMatchObject({ detalhe: { data: '2027-01-03' } })
  })

  it('dia ou mes impossivel nao vira item', () => {
    expect(montarCardapio([aniversario({ dia: 32, mes: 9 })], HOJE, [])).toEqual([])
    expect(montarCardapio([aniversario({ dia: 20, mes: 13 })], HOJE, [])).toEqual([])
    expect(montarCardapio([aniversario({})], HOJE, [])).toEqual([])
  })

  it('nao publica campo nenhum fora da lista branca', () => {
    const c = montarCardapio([aniversario({
      dia: 20, mes: 9, ano: 1970,
      // Um campo pessoal escrito na nota no Cortex nao tem por que subir.
      observacao: 'SEGREDO-OBSERVACAO', pessoa: 'SEGREDO-PESSOA'
    })], HOJE, [])
    const json = JSON.stringify(c)
    expect(json).not.toContain('SEGREDO-OBSERVACAO')
    expect(json).not.toContain('SEGREDO-PESSOA')
  })
})
