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
      acao: 'nota', tipo: 'sessao', path: 'Saude/Treinos/Push A — 2026-08-27.md',
      frontmatter: {
        tipo: 'sessao', date: '2026-08-27',
        exercicios: [{ nome: 'Supino', carga: '60 kg' }], modelo: 'Push A'
      }
    }])
  })

  it('cardio cria a nota do dia', () => {
    const [op] = planejar(ev('cardio', { aparelho: 'esteira', minutos: 30, pace: '5:45' }))
    expect(op).toEqual({
      acao: 'nota', tipo: 'cardio', path: 'Saude/Treinos/cardio-2026-08-27.md',
      frontmatter: { tipo: 'cardio', date: '2026-08-27', aparelho: 'esteira', minutos: 30, pace: '5:45' }
    })
  })

  it('peso e medida caem na MESMA nota do dia — o grafico de peso e um so', () => {
    const p = planejar(ev('peso', { peso: 78.4 }))
    const m = planejar(ev('medida', { peso: 78.4, cintura: 84 }))
    expect(p[0]).toMatchObject({ path: 'Saude/medida-2026-08-27.md' })
    expect(m[0]).toMatchObject({ path: 'Saude/medida-2026-08-27.md' })
    expect(p[0]).toMatchObject({ acao: 'nota-campos' })
  })

  it('anotacao vira nota com titulo tirado do texto', () => {
    const [op] = planejar(ev('anotacao', { texto: 'Comprar caderno novo para o cursinho' }))
    expect(op).toMatchObject({
      acao: 'nota', tipo: 'anotacao',
      path: expect.stringContaining('Vida/'),
      frontmatter: { tipo: 'anotacao', texto: 'Comprar caderno novo para o cursinho' }
    })
  })

  it('tipo desconhecido nao gera operacao — Cortex velho + app novo nao quebra', () => {
    expect(planejar(ev('coisa-do-futuro', {}))).toEqual([])
  })

  it('suplemento sem nome nao vira operacao vazia', () => {
    expect(planejar(ev('suplemento', {}))).toEqual([])
  })
})
