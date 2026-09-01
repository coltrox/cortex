import { describe, it, expect } from 'vitest'
import type { NoteComCampos } from '../index/queries'
import { montarCardapio } from './cardapio'
import { TIPOS_NOTA_CARDAPIO } from '../../shared/eventos'

/**
 * Data fixa em vez do relogio: um teste que muda de resultado conforme o dia
 * em que roda e um teste que um dia falha sozinho na CI e ninguem entende.
 */
const HOJE = '2026-08-28'

/** Chama com o `hoje` fixo -- a maioria dos testes nao fala de data. */
const montar = (notas: Parameters<typeof montarCardapio>[0]) => montarCardapio(notas, HOJE)

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
      detalhe: { dose: '30 g', quando: 'pós-treino', dias: ['seg', 'qua'] }
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
      nota({ path: 'Vida/n.md', title: 'Ideia', tipo: 'anotacao',
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
    for (const proibido of [
      'SENHA-SECRETA-123', 'pedro@mail', '99.999.999-9',
      'Almoço', '32.5', '60 kg', 'texto pessoal',
      'evitar por causa da cirurgia', 'dor lombar recorrente',
      'combinar com consulta psiquiátrica', 'prescrito pelo psiquiatra',
      'restrição renal detectada em exame recente',
      'SEGREDO-ARRAY-GRUPO', 'SEGREDO-DOSE-ARRAY', 'SEGREDO-ITENS-ARRAY',
      'SEGREDO-TITLE-TREINO', 'SEGREDO-TITLE-SUPLEMENTO'
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
    const json = JSON.stringify(montarCardapio(vault, HOJE_2))

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
    })], HOJE_3)
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
    })], HOJE_3)
    expect(c[0].detalhe.estudado).toBe(true)
  })

  it('so `estudado: true` conta -- string "sim" nao vira marcado', () => {
    const c = montarCardapio([nota({
      path: 'p.md', title: 'P1', tipo: 'prova', date: '2026-09-10',
      campos: { estudado: 'sim' }
    })], HOJE_3)
    expect(c[0].detalhe.estudado).toBeUndefined()
  })

  it('publica simulado como prova', () => {
    const c = montarCardapio([nota({
      path: 's.md', title: 'Simulado 3', tipo: 'simulado', date: '2026-09-01'
    })], HOJE_3)
    expect(c[0].especie).toBe('prova')
  })

  it('publica compromisso com hora e local', () => {
    const c = montarCardapio([nota({
      path: 'Agenda/Dentista.md', title: 'Dentista', tipo: 'evento',
      date: '2026-08-30', campos: { hora: '14:00', local: 'Centro' }
    })], HOJE_3)
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
    })], HOJE_3)
    expect(c).toEqual([])
  })

  it('publica tarefa com prazo', () => {
    const c = montarCardapio([nota({
      path: 'Estudos/Trabalho.md', title: 'Trabalho de historia', tipo: 'tarefa',
      date: '2026-09-05', campos: { materia: 'historia' }
    })], HOJE_3)
    expect(c[0]).toEqual({
      especie: 'tarefa', nome: 'Trabalho de historia',
      detalhe: { path: 'Estudos/Trabalho.md', prazo: '2026-09-05', materia: 'historia' }
    })
  })

  it('nao publica o que ja passou ha mais de dois dias', () => {
    // Publicar o histórico encheria a tela do celular com prova de 2023, e o
    // banco junto.
    const antiga = nota({ path: 'v.md', title: 'Velha', tipo: 'prova', date: '2026-08-01' })
    expect(montarCardapio([antiga], HOJE_3)).toEqual([])
  })

  it('publica o que passou ontem -- marcar "estudei" acontece depois do fato', () => {
    const ontem = nota({ path: 'o.md', title: 'Ontem', tipo: 'prova', date: '2026-08-27' })
    expect(montarCardapio([ontem], HOJE_3)).toHaveLength(1)
  })

  it('nota sem data nao entra -- nao da para saber se esta chegando', () => {
    const semData = nota({ path: 'x.md', title: 'Sem data', tipo: 'prova', date: null })
    expect(montarCardapio([semData], HOJE_3)).toEqual([])
  })
})

describe('a lista de tipos que alimenta o cardapio', () => {
  it('cobre todo tipo de nota que montarCardapio le', () => {
    // Este teste existe por um defeito real: App.tsx observava so tres destes
    // tipos para decidir republicar, entao criar uma prova ou um compromisso
    // no Cortex nao mandava nada para o celular -- a novidade so aparecia
    // quando, por acaso, um treino fosse editado depois. Agora ha uma lista
    // so, e ela precisa continuar cobrindo tudo que a funcao consulta.
    expect([...TIPOS_NOTA_CARDAPIO].sort()).toEqual([
      'evento', 'plano', 'prova', 'simulado', 'suplemento', 'tarefa', 'treino-modelo'
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
      tarefa: nota({ path: 'f.md', title: 'Ta', tipo: 'tarefa', date: '2026-09-10' })
    }
    for (const [tipo, n] of Object.entries(porTipo)) {
      const c = montarCardapio([n as never], HOJE)
      expect(c.length, tipo + ' nao virou item').toBeGreaterThan(0)
    }
    // `plano` e a excecao: ele nao vira item, ele fornece as refeicoes.
    const comPlano = montarCardapio([nota({
      path: 'g.md', title: 'Plano', tipo: 'plano',
      campos: { ativo: true, refeicoes: [{ nome: 'Cafe', hora: '07:00' }] }
    })], HOJE)
    expect(comPlano.map(i => i.especie)).toEqual(['refeicao'])
  })
})
