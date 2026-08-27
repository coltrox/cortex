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
      // e o que PODE subir, para o teste não passar por lista vazia
      nota({ path: 'Saude/Treinos/Push A.md', title: 'Push A', tipo: 'treino-modelo',
             campos: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8' }] } })
    ]
    const json = JSON.stringify(montarCardapio(vault))

    expect(json).toContain('Push A')          // o cardápio não veio vazio
    for (const proibido of [
      'SENHA-SECRETA-123', 'pedro@mail', '99.999.999-9',
      'Almoço', '32.5', '60 kg', 'texto pessoal'
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
