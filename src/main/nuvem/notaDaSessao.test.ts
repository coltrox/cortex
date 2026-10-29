import { describe, it, expect } from 'vitest'
import {
  normalizarSessao, notaDaSessao, destaques, MINIMO_PARA_DESTAQUE,
  type SessaoNormalizada
} from './notaDaSessao'

const payload = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  inicio: '2026-10-20T14:30',
  fim: '2026-10-20T15:10',
  minutos: 40,
  materias: [
    { nome: 'matemática', certas: 6, erradas: 2 },
    { nome: 'biologia', certas: 1, erradas: 3 }
  ],
  conteudos: [
    { nome: 'Trigonometria', certas: 6, erradas: 2 },
    { nome: 'Célula e corpo humano', certas: 1, erradas: 3 }
  ],
  ...extra
})

const sessao = (): SessaoNormalizada => {
  const s = normalizarSessao(payload())
  if (!s) throw new Error('payload de teste deveria ser válido')
  return s
}

describe('normalizarSessao', () => {
  it('aceita a sessao completa', () => {
    expect(sessao()).toMatchObject({
      dia: '2026-10-20',
      inicio: '14h30',
      fim: '15h10',
      minutos: 40
    })
  })

  it('sem hora de inicio nao e sessao', () => {
    // Ele pediu "de tal horario": sem isso a nota nao tem como se chamar.
    expect(normalizarSessao(payload({ inicio: '2026-10-20' }))).toBeNull()
  })

  it('sem questao nenhuma E sem assunto, nao cria nota', () => {
    /* E o botao de encerrar tocado por engano. Criar arquivo para isso
       encheria o vault de relatorios vazios. */
    expect(normalizarSessao(payload({ materias: [], conteudos: [] }))).toBeNull()
  })

  it('sem questao nenhuma MAS com assunto, vale', () => {
    /* O caso que ele trouxe: "hoje eu fiz a redacao com ela ligada... se eu
       fiz exercicio fora do Cortex, ou ate mesmo a redacao, nao tem como
       registrar isso". O assunto escrito a mao e o que separa isto do toque
       acidental — ninguem digita "redacao" por engano. */
    const s = normalizarSessao(payload({
      materias: [], conteudos: [], assunto: 'redação'
    }))
    expect(s).toMatchObject({ dia: '2026-10-20', minutos: 40, assunto: 'redação' })
    expect(s?.materias).toEqual([])
  })

  it('assunto vira uma linha curta', () => {
    // Vai para titulo de nota e nome de arquivo: quebra de linha sairia no
    // meio do YAML, e 300 caracteres nao caberiam no caminho.
    const s = normalizarSessao(payload({ assunto: '  revisão\n  de  genética  ' }))
    expect(s?.assunto).toBe('revisão de genética')
    expect(normalizarSessao(payload({ assunto: 'x'.repeat(300) }))?.assunto).toHaveLength(80)
    expect(normalizarSessao(payload({ assunto: { a: 1 } }))?.assunto).toBe('')
  })

  it('data torta e recusada', () => {
    expect(normalizarSessao({ inicio: 'hoje de tarde' })).toBeNull()
    expect(normalizarSessao({})).toBeNull()
  })

  it('doze horas de treino nao entra na conta de tempo', () => {
    // App com defeito, nao estudo. A sessao continua valendo; o tempo, nao.
    expect(normalizarSessao(payload({ minutos: 900 }))?.minutos).toBe(0)
    expect(normalizarSessao(payload({ minutos: -5 }))?.minutos).toBe(0)
  })

  it('placar sem nome ou sem questao nenhuma e descartado', () => {
    const s = normalizarSessao(payload({
      materias: [
        { nome: '', certas: 3, erradas: 0 },
        { nome: 'história', certas: 0, erradas: 0 },
        { nome: 'física', certas: 2, erradas: 1 }
      ]
    }))
    expect(s?.materias.map(m => m.nome)).toEqual(['física'])
  })

  it('contagem negativa vira zero em vez de poluir o relatorio', () => {
    const s = normalizarSessao(payload({
      materias: [{ nome: 'química', certas: -4, erradas: 2 }]
    }))
    expect(s?.materias[0]).toEqual({ nome: 'química', certas: 0, erradas: 2 })
  })

  it('fim ausente nao impede a nota', () => {
    // O aparelho pode ter morrido antes de fechar a sessao.
    expect(normalizarSessao(payload({ fim: '' }))?.fim).toBe('')
  })
})

describe('destaques', () => {
  const p = (nome: string, certas: number, erradas: number) => ({ nome, certas, erradas })

  it('separa onde foi bem de onde foi mal', () => {
    const r = destaques([p('Trigonometria', 6, 2), p('Célula', 1, 3)])
    expect(r.bem.map(x => x.nome)).toEqual(['Trigonometria'])
    expect(r.mal.map(x => x.nome)).toEqual(['Célula'])
  })

  it('assunto com menos de tres questoes nao vira destaque', () => {
    const r = destaques([p('Ondas', 2, 0), p('Trigonometria', 6, 2)])
    expect(r.bem.map(x => x.nome)).not.toContain('Ondas')
    expect(MINIMO_PARA_DESTAQUE).toBe(3)
  })

  it('tudo igual nao tem melhor nem pior', () => {
    expect(destaques([p('a', 2, 2), p('b', 3, 3)])).toEqual({ bem: [], mal: [] })
  })
})

describe('notaDaSessao', () => {
  it('o caminho leva a HORA, nao so o dia', () => {
    /* Treinar duas vezes no mesmo dia e o caso normal. Um arquivo por dia
       faria a sessao da noite apagar a da tarde. */
    expect(notaDaSessao(sessao()).path).toBe('Estudos/Sessoes/2026-10-20 14h30.md')
  })

  it('com assunto, o titulo diz do que foi a sessao', () => {
    /* Numa lista de sessoes, "Sessao de estudo — redacao" diz o que
       "Sessao de estudos — 29/10, 14h30" nunca disse. */
    const s = normalizarSessao(payload({ assunto: 'redação' }))!
    const n = notaDaSessao(s)
    expect(n.frontmatter.titulo).toBe('Sessão de estudo — redação (20/10, 14h30)')
    expect(n.frontmatter.assunto).toBe('redação')
  })

  it('sessao sem questao nenhuma: tempo e assunto, sem 0% de aproveitamento', () => {
    /* "0 questoes · 0 acertos · 0%" leria como fracasso, quando o que houve
       foi estudo em outro lugar. */
    const s = normalizarSessao(payload({
      materias: [], conteudos: [], assunto: 'redação'
    }))!
    const n = notaDaSessao(s)
    expect(n.frontmatter).not.toHaveProperty('aproveitamento')
    expect(n.frontmatter).not.toHaveProperty('total')
    expect(n.frontmatter.minutos).toBe(40)
    expect(n.corpo).toContain('redação')
    expect(n.corpo).not.toContain('%')
    expect(n.corpo).toContain('registrado à mão')
  })

  it('o frontmatter traz o total e o aproveitamento', () => {
    expect(notaDaSessao(sessao()).frontmatter).toEqual({
      tipo: 'sessao-estudo',
      titulo: 'Sessão de estudos — 20/10, 14h30',
      data: '2026-10-20',
      inicio: '14h30',
      fim: '15h10',
      minutos: 40,
      total: 12,
      acertos: 7,
      aproveitamento: 58
    })
  })

  it('o corpo tem uma tabela por materia e uma por conteudo', () => {
    const { corpo } = notaDaSessao(sessao())
    expect(corpo).toContain('## Por matéria')
    expect(corpo).toContain('| matemática | 6 | 2 | 75% |')
    expect(corpo).toContain('## Por conteúdo')
    expect(corpo).toContain('| Trigonometria | 6 | 2 | 75% |')
  })

  it('o pior aproveitamento aparece primeiro na tabela', () => {
    // A nota existe para dizer o que estudar amanha.
    const { corpo } = notaDaSessao(sessao())
    expect(corpo.indexOf('| biologia |')).toBeLessThan(corpo.indexOf('| matemática |'))
  })

  it('diz onde foi bem e onde precisa voltar', () => {
    const { corpo } = notaDaSessao(sessao())
    expect(corpo).toContain('**Fui bem em:** Trigonometria (75%)')
    expect(corpo).toContain('**Preciso voltar em:** Célula e corpo humano (25%)')
  })

  it('o resumo do topo traz tempo, total e acertos', () => {
    const { corpo } = notaDaSessao(sessao())
    expect(corpo.split('\n')[0]).toBe(
      '**40 min** (14h30 às 15h10) · **12** questões · **7** acertos e ' +
      '**5** erros · **58%** de aproveitamento.'
    )
  })

  it('treino curto assume que nao da para apontar forte e fraco', () => {
    const s = normalizarSessao(payload({
      materias: [{ nome: 'física', certas: 1, erradas: 1 }],
      conteudos: [{ nome: 'Ondas', certas: 1, erradas: 1 }]
    }))
    expect(s).not.toBeNull()
    const { corpo } = notaDaSessao(s as SessaoNormalizada)
    expect(corpo).toContain('Treino curto para apontar forte e fraco')
    expect(corpo).not.toContain('Fui bem em')
  })

  it('uma questao so nao vira plural', () => {
    const s = normalizarSessao(payload({
      minutos: 0,
      materias: [{ nome: 'física', certas: 1, erradas: 0 }],
      conteudos: []
    }))
    const { corpo } = notaDaSessao(s as SessaoNormalizada)
    expect(corpo).toContain('**1** questão')
    expect(corpo).toContain('**1** acerto e **0** erros')
  })

  it('o arquivo nunca escapa da pasta de estudos', () => {
    /* O payload vem da internet. O caminho e montado so com o dia e a hora
       ja validados por regex, e o que sobra passa por `seguro`. */
    const s = normalizarSessao(payload())
    expect(notaDaSessao(s as SessaoNormalizada).path.startsWith('Estudos/Sessoes/')).toBe(true)
  })
})
