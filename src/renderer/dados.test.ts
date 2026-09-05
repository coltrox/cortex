import { describe, it, expect } from 'vitest'
import type { NoteComCampos } from './tipos'
import {
  corpoAlinhado, extrairTransacoes, porCategoria, saldoPorquinho,
  suplementosDoDia, totaisDoDia, seriePeso, serieAgua, litros, textos
} from './dados'

/** Nota sintetica com o minimo que as leituras precisam. */
const nota = (p: Partial<NoteComCampos> & { path: string }): NoteComCampos => ({
  path: p.path,
  title: p.title ?? p.path,
  tipo: p.tipo ?? 'nota',
  project: null, status: null, created: null, updated: null,
  date: p.date ?? null,
  mtime: p.mtime ?? 0, size: 0, parseError: null,
  campos: p.campos ?? {}
})

describe('corpoAlinhado', () => {
  it('mantem o numero da linha depois de tirar o frontmatter', () => {
    const raw = '---\ntipo: nota\ndate: 2026-08-27\n---\n\n- [ ] estudar\n'
    const corpo = corpoAlinhado(raw)
    // A tarefa esta na linha 5 do arquivo; tem que continuar na 5 do corpo.
    expect(raw.split('\n')[5]).toBe('- [ ] estudar')
    expect(corpo.split('\n')[5]).toBe('- [ ] estudar')
  })

  it('esconde o YAML sem mexer no resto', () => {
    const corpo = corpoAlinhado('---\nsenha: segredo\n---\ntexto')
    expect(corpo).not.toContain('segredo')
    expect(corpo).toContain('texto')
  })

  it('funciona com CRLF — o regex de frontmatter escrito para LF nao pegava', () => {
    const raw = '---\r\ntipo: nota\r\n---\r\n\r\n- [ ] tarefa\r\n'
    const corpo = corpoAlinhado(raw)
    expect(corpo).not.toContain('tipo: nota')
    expect(corpo.split('\n')[4]).toBe('- [ ] tarefa')
  })

  it('devolve o texto inteiro quando nao ha frontmatter', () => {
    expect(corpoAlinhado('# so titulo')).toBe('# so titulo')
  })

  it('nao engole o corpo quando o frontmatter esta sem fechamento', () => {
    const raw = '---\ntipo: nota\n\n# titulo'
    expect(corpoAlinhado(raw)).toBe(raw)
  })
})

describe('extrairTransacoes', () => {
  const notas = [
    nota({
      path: 'Diario/2026-08-27.md', date: '2026-08-27',
      campos: {
        transacoes: [
          { dir: 'saida', item: 'Almoco', valor: 32, cat: 'alimentacao' },
          { dir: 'entrada', item: 'Freela', valor: 500, cat: 'trabalho' }
        ]
      }
    }),
    nota({
      path: 'Diario/2026-08-26.md', date: '2026-08-26',
      campos: { gastos: [{ item: 'Uber', valor: 18, cat: 'transporte' }] }
    })
  ]

  it('le transacoes e gastos legados juntos', () => {
    expect(extrairTransacoes(notas)).toHaveLength(3)
  })

  it('item da lista legada gastos e sempre saida', () => {
    const uber = extrairTransacoes(notas).find(t => t.item === 'Uber')
    expect(uber?.dir).toBe('saida')
    expect(uber?.campo).toBe('gastos')
  })

  it('respeita a direcao declarada', () => {
    const txs = extrairTransacoes(notas)
    expect(txs.find(t => t.item === 'Freela')?.dir).toBe('entrada')
    expect(txs.find(t => t.item === 'Almoco')?.dir).toBe('saida')
  })

  it('item sem dir conta como saida', () => {
    const [t] = extrairTransacoes([nota({
      path: 'd.md', date: '2026-08-27',
      campos: { transacoes: [{ item: 'Pao', valor: 8 }] }
    })])
    expect(t.dir).toBe('saida')
  })

  it('ordena do mais recente para o mais antigo', () => {
    expect(extrairTransacoes(notas)[0].data).toBe('2026-08-27')
  })

  it('ignora nota sem data — ela nao pertence a nenhum dia', () => {
    const semData = nota({ path: 'x.md', campos: { transacoes: [{ item: 'X', valor: 1 }] } })
    expect(extrairTransacoes([semData])).toHaveLength(0)
  })

  it('guarda o indice para saber qual linha da lista e qual', () => {
    const txs = extrairTransacoes(notas).filter(t => t.campo === 'transacoes')
    expect(txs.map(t => t.i).sort()).toEqual([0, 1])
  })

  it('soma por categoria conta so as saidas', () => {
    const cats = porCategoria(extrairTransacoes(notas))
    expect(cats.get('alimentacao')).toBe(32)
    expect(cats.get('transporte')).toBe(18)
    expect(cats.has('trabalho')).toBe(false)
  })
})

describe('saldoPorquinho', () => {
  const movs = [
    nota({ path: 'a.md', tipo: 'porquinho', campos: { direcao: 'deposito', valor: 200 } }),
    nota({ path: 'b.md', tipo: 'porquinho', campos: { direcao: 'sangria', valor: 50 } }),
    nota({ path: 'c.md', tipo: 'porquinho', campos: { direcao: 'saida', valor: 30 } }),
    nota({ path: 'd.md', tipo: 'porquinho', campos: { valor: 10 } })
  ]

  it('soma depositos e subtrai sangrias', () => {
    expect(saldoPorquinho(movs)).toEqual({ depositado: 210, sangrado: 80, saldo: 130 })
  })

  it('aceita saida como sinonimo de sangria — vocabulario da versao antiga', () => {
    const so = [nota({ path: 'c.md', tipo: 'porquinho', campos: { direcao: 'saida', valor: 30 } })]
    expect(saldoPorquinho(so).sangrado).toBe(30)
  })

  it('movimento sem direcao conta como deposito', () => {
    const so = [nota({ path: 'd.md', tipo: 'porquinho', campos: { valor: 10 } })]
    expect(saldoPorquinho(so).depositado).toBe(10)
  })

  it('sem movimentos, saldo zero', () => {
    expect(saldoPorquinho([]).saldo).toBe(0)
  })
})

describe('suplementosDoDia', () => {
  // 2026-08-27 e uma quinta-feira.
  const quinta = '2026-08-27'
  const sexta = '2026-08-28'

  const whey = nota({ path: 'w.md', tipo: 'suplemento', title: 'Whey', campos: { dias: ['seg', 'qui'] } })
  const creatina = nota({ path: 'c.md', tipo: 'suplemento', title: 'Creatina', campos: {} })
  const naoSuplemento = nota({ path: 'x.md', tipo: 'nota', campos: { dias: ['qui'] } })

  it('traz o suplemento marcado para o dia da semana', () => {
    expect(suplementosDoDia([whey], quinta).map(s => s.title)).toEqual(['Whey'])
  })

  it('nao traz o suplemento em dia que nao foi marcado', () => {
    expect(suplementosDoDia([whey], sexta)).toHaveLength(0)
  })

  it('sem dias declarados, vale todo dia — nao some da rotina em silencio', () => {
    expect(suplementosDoDia([creatina], quinta)).toHaveLength(1)
    expect(suplementosDoDia([creatina], sexta)).toHaveLength(1)
  })

  it('aceita dias escritos a mao como "seg, qui"', () => {
    const manual = nota({ path: 'm.md', tipo: 'suplemento', campos: { dias: 'seg, qui' } })
    expect(suplementosDoDia([manual], quinta)).toHaveLength(1)
    expect(suplementosDoDia([manual], sexta)).toHaveLength(0)
  })

  it('ignora nota que nao e suplemento', () => {
    expect(suplementosDoDia([naoSuplemento], quinta)).toHaveLength(0)
  })
})

describe('totaisDoDia', () => {
  const plano = nota({
    path: 'p.md', tipo: 'plano',
    campos: {
      ativo: true, kcal: 2200,
      refeicoes: [
        { nome: 'Cafe', kcal: 400, prot: 30 },
        { nome: 'Almoco', kcal: 800, prot: 50 },
        { nome: 'Janta', kcal: 700, prot: 45 }
      ]
    }
  })

  it('soma so as refeicoes marcadas', () => {
    const diario = nota({ path: 'd.md', tipo: 'diario', campos: { dieta_feitas: ['Cafe', 'Almoco'] } })
    const t = totaisDoDia(plano, diario)
    expect(t.kcal).toBe(1200)
    expect(t.prot).toBe(80)
    expect(t.marcadas).toBe(2)
    expect(t.total).toBe(3)
  })

  it('soma o que foi comido fora do plano', () => {
    const diario = nota({
      path: 'd.md', tipo: 'diario',
      campos: { dieta_feitas: ['Cafe'], extras: [{ item: 'Coxinha', kcal: 300, prot: 10 }] }
    })
    const t = totaisDoDia(plano, diario)
    expect(t.kcal).toBe(700)
    expect(t.prot).toBe(40)
  })

  it('dia sem nada marcado zera — e o que faz o dia novo comecar limpo', () => {
    expect(totaisDoDia(plano, undefined).kcal).toBe(0)
    expect(totaisDoDia(plano, undefined).total).toBe(3)
  })

  it('sem plano ativo, nao inventa refeicao', () => {
    const diario = nota({ path: 'd.md', tipo: 'diario', campos: { dieta_feitas: ['Cafe'] } })
    expect(totaisDoDia(undefined, diario)).toEqual({ kcal: 0, prot: 0, marcadas: 0, total: 0 })
  })

  it('refeicao marcada que nao existe mais no plano nao conta', () => {
    const diario = nota({ path: 'd.md', tipo: 'diario', campos: { dieta_feitas: ['Lanche da tarde'] } })
    expect(totaisDoDia(plano, diario).kcal).toBe(0)
  })
})

describe('seriePeso', () => {
  it('junta peso de qualquer tipo de nota, em ordem de data', () => {
    const ns = [
      nota({ path: 'b.md', tipo: 'medida', date: '2026-08-20', campos: { peso: 79 } }),
      nota({ path: 'a.md', tipo: 'diario', date: '2026-08-10', campos: { peso: 80.5 } }),
      nota({ path: 'c.md', tipo: 'nota', date: '2026-08-25', campos: {} })
    ]
    expect(seriePeso(ns)).toEqual([
      { x: '2026-08-10', y: 80.5 },
      { x: '2026-08-20', y: 79 }
    ])
  })

  it('peso zero conta — nao pode sumir por ser falsy', () => {
    const ns = [nota({ path: 'a.md', date: '2026-08-10', campos: { peso: 0 } })]
    expect(seriePeso(ns)).toEqual([{ x: '2026-08-10', y: 0 }])
  })
})

describe('textos', () => {
  it('devolve lista vazia para ausente', () => {
    expect(textos(undefined)).toEqual([])
    expect(textos('')).toEqual([])
  })
  it('separa string por virgula e limpa espacos', () => {
    expect(textos(' a , b ')).toEqual(['a', 'b'])
  })
})

describe('serieAgua', () => {
  it('junta o total de cada dia, do mais antigo ao mais novo', () => {
    // O historico ja existia -- um `agua_ml` por diario -- so nao tinha onde
    // aparecer. Isto e o que a aba Hidratacao desenha.
    const ns = [
      nota({ path: 'd2.md', tipo: 'diario', date: '2026-09-03', campos: { agua_ml: 3200 } }),
      nota({ path: 'd1.md', tipo: 'diario', date: '2026-09-02', campos: { agua_ml: 800 } }),
      nota({ path: 'd3.md', tipo: 'diario', date: '2026-09-04', campos: { agua_ml: 2400 } })
    ]
    expect(serieAgua(ns)).toEqual([
      { x: '2026-09-02', y: 800 },
      { x: '2026-09-03', y: 3200 },
      { x: '2026-09-04', y: 2400 }
    ])
  })

  it('dia sem o campo fica de fora, e nao entra como zero', () => {
    // "Nao registrei" e "nao bebi nada" sao coisas diferentes. Um zero
    // inventado afundaria a media de qualquer semana sem sinal.
    const ns = [
      nota({ path: 'd1.md', tipo: 'diario', date: '2026-09-02', campos: { agua_ml: 2000 } }),
      nota({ path: 'd2.md', tipo: 'diario', date: '2026-09-03', campos: {} })
    ]
    expect(serieAgua(ns).map(p => p.x)).toEqual(['2026-09-02'])
  })

  it('so o diario conta -- `agua_ml` em outra nota nao entra', () => {
    // Diferente de `seriePeso`, que junta peso de qualquer nota: o total do
    // dia e do diario, e so ele tem um por dia.
    const ns = [
      nota({ path: 'x.md', tipo: 'nota', date: '2026-09-02', campos: { agua_ml: 9000 } }),
      nota({ path: 'd.md', tipo: 'diario', date: '2026-09-02', campos: { agua_ml: 2000 } })
    ]
    expect(serieAgua(ns)).toEqual([{ x: '2026-09-02', y: 2000 }])
  })

  it('diario sem data fica de fora', () => {
    const ns = [nota({ path: 'd.md', tipo: 'diario', date: null, campos: { agua_ml: 2000 } })]
    expect(serieAgua(ns)).toEqual([])
  })
})

describe('litros', () => {
  it('mostra em litros, com virgula -- igual ao app web', () => {
    // As duas telas mostram o mesmo numero do mesmo dia. Uma dizendo "2,4 L"
    // e a outra "2.400 ml" faz a pessoa desconfiar de qual esta certa.
    expect(litros(1600)).toBe('1,6 L')
    expect(litros(3500)).toBe('3,5 L')
  })

  it('zero e total redondo tambem vem com a casa', () => {
    expect(litros(0)).toBe('0,0 L')
    expect(litros(2000)).toBe('2,0 L')
  })
})
