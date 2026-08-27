import { describe, it, expect } from 'vitest'
import type { NoteComCampos } from '../index/queries'
import { montarCardapio } from './cardapio'

const nota = (p: Partial<NoteComCampos> & { path: string }): NoteComCampos => ({
  path: p.path, title: p.title ?? p.path, tipo: p.tipo ?? 'nota',
  project: null, status: null, created: null, updated: null, date: p.date ?? null,
  mtime: 0, size: 0, parseError: null, campos: p.campos ?? {}
})

describe('montarCardapio', () => {
  it('publica o treino com exercicios, series e reps', () => {
    const c = montarCardapio([nota({
      path: 'Saude/Treinos/Push A.md', title: 'Push A', tipo: 'treino-modelo',
      campos: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8-10' }] }
    })])
    expect(c).toEqual([{
      especie: 'treino', nome: 'Push A',
      detalhe: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8-10' }] }
    }])
  })

  it('NAO publica a carga — ela e historico, nao estrutura', () => {
    const c = montarCardapio([nota({
      path: 't.md', title: 'Push A', tipo: 'treino-modelo',
      campos: { exercicios: [{ nome: 'Supino', series: 4, reps: '8', carga: '60 kg' }] }
    })])
    expect(JSON.stringify(c)).not.toContain('60 kg')
    expect(JSON.stringify(c)).not.toContain('carga')
  })

  it('publica suplemento com dose, quando e dias', () => {
    const c = montarCardapio([nota({
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
    const c = montarCardapio([ativo, inativo])
    expect(c.filter(i => i.especie === 'refeicao').map(i => i.nome)).toEqual(['Café'])
  })

  it('ignora tipos que nao sao cardapio', () => {
    const c = montarCardapio([
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
    const json = JSON.stringify(montarCardapio(vault))

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
    const c = montarCardapio([nota({
      path: 't.md', title: 'Sem nada', tipo: 'treino-modelo', campos: { exercicios: 'nao e lista' }
    })])
    expect(c).toEqual([{ especie: 'treino', nome: 'Sem nada', detalhe: { exercicios: [] } }])
  })
})
