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
})
