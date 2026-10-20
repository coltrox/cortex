import { describe, it, expect } from 'vitest'
import {
  iniciar, anotar, desfazerUltima, marcaDeTempo, rotuloDeHora, minutos, diaDaSessao,
  placares, totalGeral, destaques, porcentagem, resumir,
  lerSessao, gravarSessao, limparSessao, MINIMO_PARA_DESTAQUE,
  type RespostaSessao
} from './sessao'
import type { Guardado } from './guardado'

const resposta = (
  materia: string, conteudo: string, acertou: boolean, chave = `${conteudo}#1`
): RespostaSessao => ({ chave, materia, conteudo, acertou })

/** Um `localStorage` de mentira, para o teste não depender do navegador. */
function memoria(inicial: Record<string, string> = {}): Guardado {
  const dados = { ...inicial }
  return {
    ler: (k: string) => dados[k] ?? null,
    gravar: (k: string, v: string) => { dados[k] = v },
    apagar: (k: string) => { delete dados[k] }
  }
}

describe('marcaDeTempo', () => {
  it('usa a hora LOCAL, nunca o UTC', () => {
    /* `toISOString()` de 20/10 as 23h vira dia 21 em qualquer fuso a oeste de
       Londres — e a sessao da noite apareceria no dia seguinte. */
    expect(marcaDeTempo(new Date(2026, 9, 20, 23, 45))).toBe('2026-10-20T23:45')
  })

  it('completa com zero a esquerda', () => {
    expect(marcaDeTempo(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07')
  })
})

describe('rotuloDeHora', () => {
  it('mostra a hora como ele fala', () => {
    expect(rotuloDeHora('2026-10-20T14:30')).toBe('14h30')
  })

  it('marca sem hora nao inventa', () => {
    expect(rotuloDeHora('2026-10-20')).toBe('')
  })
})

describe('minutos', () => {
  it('conta o tempo da sessao', () => {
    expect(minutos('2026-10-20T14:30', '2026-10-20T15:10')).toBe(40)
  })

  it('atravessa a meia-noite', () => {
    expect(minutos('2026-10-20T23:40', '2026-10-21T00:20')).toBe(40)
  })

  it('fim antes do comeco nao vira tempo negativo', () => {
    // Relogio do aparelho ajustado no meio da sessao.
    expect(minutos('2026-10-20T15:00', '2026-10-20T14:00')).toBe(0)
  })

  it('data torta vale zero', () => {
    expect(minutos('ontem', '2026-10-20T14:00')).toBe(0)
  })
})

describe('iniciar e anotar', () => {
  it('a sessao nasce vazia, com a hora de comeco', () => {
    const s = iniciar(new Date(2026, 9, 20, 14, 30))
    expect(s.inicio).toBe('2026-10-20T14:30')
    expect(s.respostas).toEqual([])
    expect(diaDaSessao(s)).toBe('2026-10-20')
  })

  it('a mesma questao respondida duas vezes conta duas vezes', () => {
    /* No treino ele repete de proposito. A segunda tentativa e justamente a
       que mostra se aprendeu — esconder seria perder o dado. */
    let s = iniciar(new Date(2026, 9, 20, 14, 30))
    s = anotar(s, resposta('matemática', 'Trigonometria', false))
    s = anotar(s, resposta('matemática', 'Trigonometria', true))
    expect(s.respostas).toHaveLength(2)
    expect(totalGeral(s.respostas)).toMatchObject({ certas: 1, erradas: 1, total: 2 })
  })

  it('anotar nao modifica a sessao antiga', () => {
    const antes = iniciar(new Date(2026, 9, 20, 14, 30))
    anotar(antes, resposta('física', 'Cinemática', true))
    expect(antes.respostas).toHaveLength(0)
  })
})

describe('placares', () => {
  const respostas = [
    resposta('matemática', 'Trigonometria', true),
    resposta('matemática', 'Trigonometria', true),
    resposta('matemática', 'Funções', false),
    resposta('biologia', 'Célula', false),
    resposta('biologia', 'Célula', false)
  ]

  it('soma acerto e erro por materia', () => {
    const ps = placares(respostas, 'materia')
    expect(ps.find(p => p.nome === 'matemática'))
      .toMatchObject({ certas: 2, erradas: 1, total: 3 })
    expect(ps.find(p => p.nome === 'biologia'))
      .toMatchObject({ certas: 0, erradas: 2, total: 2 })
  })

  it('o pior aproveitamento vem primeiro', () => {
    // A lista existe para dizer o que estudar amanha; o que ja esta resolvido
    // pode ficar no fim.
    expect(placares(respostas, 'materia')[0]?.nome).toBe('biologia')
  })

  it('agrupa tambem por conteudo', () => {
    const ps = placares(respostas, 'conteudo')
    expect(ps.map(p => p.nome).sort()).toEqual(['Célula', 'Funções', 'Trigonometria'])
    expect(ps.find(p => p.nome === 'Trigonometria')?.taxa).toBe(1)
  })

  it('questao sem materia nao desaparece da conta', () => {
    const ps = placares([resposta('', 'Avulsa', true)], 'materia')
    expect(ps).toHaveLength(1)
    expect(ps[0]?.nome).toBe('sem matéria')
  })

  it('sem respostas, lista vazia — e nenhum NaN', () => {
    expect(placares([], 'materia')).toEqual([])
    expect(totalGeral([])).toMatchObject({ total: 0, taxa: 0 })
  })
})

describe('destaques', () => {
  const placar = (nome: string, certas: number, total: number) => ({
    nome, certas, erradas: total - certas, total, taxa: certas / total
  })

  it('aponta o melhor e o pior', () => {
    const r = destaques([placar('biologia', 1, 4), placar('matemática', 4, 4)])
    expect(r.mal.map(p => p.nome)).toEqual(['biologia'])
    expect(r.bem.map(p => p.nome)).toEqual(['matemática'])
  })

  it('uma questao acertada nao vira "melhor materia do dia"', () => {
    /* Sem o piso, a unica questao de fisica que apareceu daria 100% e
       mandaria ele parar de estudar fisica. */
    const r = destaques([placar('física', 1, 1), placar('matemática', 3, 5)])
    expect(r.bem.map(p => p.nome)).not.toContain('física')
    expect(MINIMO_PARA_DESTAQUE).toBe(3)
  })

  it('empate em tudo nao tem melhor nem pior', () => {
    const r = destaques([placar('a', 2, 4), placar('b', 2, 4)])
    expect(r).toEqual({ bem: [], mal: [] })
  })

  it('dois empatados no pior aparecem os dois', () => {
    const r = destaques([placar('a', 1, 4), placar('b', 1, 4), placar('c', 4, 4)])
    expect(r.mal.map(p => p.nome).sort()).toEqual(['a', 'b'])
  })

  it('sessao curta nao produz destaque nenhum', () => {
    expect(destaques([placar('a', 1, 2)])).toEqual({ bem: [], mal: [] })
  })
})

describe('porcentagem', () => {
  it('arredonda para o inteiro', () => {
    expect(porcentagem(0.666)).toBe(67)
    expect(porcentagem(0)).toBe(0)
    expect(porcentagem(1)).toBe(100)
  })
})

describe('resumir', () => {
  it('junta tempo, materias e conteudos', () => {
    let s = iniciar(new Date(2026, 9, 20, 14, 30))
    s = anotar(s, resposta('matemática', 'Trigonometria', true))
    s = anotar(s, resposta('biologia', 'Célula', false))

    const r = resumir(s, new Date(2026, 9, 20, 15, 10))
    expect(r).toMatchObject({
      inicio: '2026-10-20T14:30',
      fim: '2026-10-20T15:10',
      minutos: 40
    })
    expect(r.materias).toHaveLength(2)
    expect(r.conteudos).toHaveLength(2)
  })
})

describe('a sessao guardada no aparelho', () => {
  it('grava e le de volta', () => {
    const g = memoria()
    let s = iniciar(new Date(2026, 9, 20, 14, 30))
    s = anotar(s, resposta('matemática', 'Trigonometria', true))
    gravarSessao(g, s)
    expect(lerSessao(g)).toEqual(s)
  })

  it('sem sessao aberta, nada', () => {
    expect(lerSessao(memoria())).toBeNull()
  })

  it('encerrar apaga a sessao', () => {
    const g = memoria()
    gravarSessao(g, iniciar(new Date(2026, 9, 20, 14, 30)))
    limparSessao(g)
    expect(lerSessao(g)).toBeNull()
  })

  it('JSON torto nao derruba a tela de treino', () => {
    expect(lerSessao(memoria({ 'cortex.sessao-estudo': '{{{' }))).toBeNull()
  })

  it('sessao sem comeco e descartada', () => {
    // Sem a hora de inicio nao ha sessao: o relatorio nao teria o "de tal
    // horario" que ele pediu.
    expect(lerSessao(memoria({ 'cortex.sessao-estudo': '{"respostas":[]}' }))).toBeNull()
  })

  it('resposta torta e ignorada, a boa fica', () => {
    const g = memoria({
      'cortex.sessao-estudo': JSON.stringify({
        inicio: '2026-10-20T14:30',
        respostas: [
          { chave: 'a#1', materia: 'matemática', conteudo: 'Trigonometria', acertou: true },
          { materia: 'sem chave' },
          null,
          'lixo'
        ]
      })
    })
    const s = lerSessao(g)
    expect(s?.respostas).toHaveLength(1)
    expect(s?.respostas[0]?.chave).toBe('a#1')
  })

  it('acertou so e verdade quando e booleano true', () => {
    const g = memoria({
      'cortex.sessao-estudo': JSON.stringify({
        inicio: '2026-10-20T14:30',
        respostas: [{ chave: 'a#1', acertou: 'sim' }]
      })
    })
    expect(lerSessao(g)?.respostas[0]?.acertou).toBe(false)
  })
})

describe('desfazerUltima', () => {
  const base = () => {
    let s = iniciar(new Date(2026, 9, 20, 14, 30))
    s = anotar(s, resposta('matemática', 'Trigonometria', true))
    s = anotar(s, resposta('biologia', 'Célula', false, 'Célula#2'))
    return s
  }

  it('tira a resposta dada por engano', () => {
    const s = desfazerUltima(base(), 'Célula#2')
    expect(s.respostas).toHaveLength(1)
    expect(s.respostas[0]?.conteudo).toBe('Trigonometria')
  })

  it('so desfaz a ULTIMA, e so se for daquela questao', () => {
    /* Se ele ja respondeu outra no meio, contestar a anterior sairia
       removendo a errada — e o relatorio ficaria pior do que sem contestar. */
    const s = desfazerUltima(base(), 'Trigonometria#1')
    expect(s.respostas).toHaveLength(2)
  })

  it('sessao vazia nao quebra', () => {
    const s = iniciar(new Date(2026, 9, 20, 14, 30))
    expect(desfazerUltima(s, 'qualquer').respostas).toEqual([])
  })
})
