import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import {
  lerCardapio, gravarCardapio, diaDaSemana,
  suplementosDoDia, refeicoesDoPlano, treinos, exerciciosDoTreino,
  provas, compromissos, tarefas, caminhoDe, dataDe, faltam, dataCurta, haQuantoTempo,
  hidratacao, litros
} from './cardapio'
import { jaFeitos, marcarFeito, desmarcarFeito } from './feitos'
import type { ItemCardapio } from '@compartilhado/eventos'

const ITENS: ItemCardapio[] = [
  { especie: 'suplemento', nome: 'Creatina', detalhe: { dose: '5 g', dias: ['seg', 'qua', 'sex'] } },
  { especie: 'suplemento', nome: 'Vitamina D', detalhe: { dose: '2000 UI' } },
  { especie: 'refeicao', nome: 'Café da manhã', detalhe: { hora: '07:00', kcal: 500 } },
  {
    especie: 'treino', nome: 'Peito e tríceps',
    detalhe: { grupo: 'peito', exercicios: [{ nome: 'Supino reto', series: 4, reps: '8-10' }] }
  }
]

describe('cardápio guardado', () => {
  it('vem vazio quando nunca foi buscado', () => {
    expect(lerCardapio(guardadoDeMemoria())).toEqual({ itens: [], atualizadoEm: null })
  })

  it('grava e lê', () => {
    const g = guardadoDeMemoria()
    gravarCardapio(g, ITENS, '2026-08-28T10:00:00.000Z')
    const c = lerCardapio(g)
    expect(c.itens).toHaveLength(4)
    expect(c.atualizadoEm).toBe('2026-08-28T10:00:00.000Z')
  })

  it('volta vazio se o armazenamento estiver corrompido', () => {
    expect(lerCardapio(guardadoDeMemoria({ 'cortex.cardapio': '{{{' })).itens).toEqual([])
  })

  it('descarta item guardado fora de forma', () => {
    const cru = JSON.stringify({
      atualizadoEm: null,
      itens: [{ especie: 'treino', nome: 'Peito', detalhe: {} }, { especie: 'foguete' }]
    })
    expect(lerCardapio(guardadoDeMemoria({ 'cortex.cardapio': cru })).itens).toHaveLength(1)
  })
})

describe('diaDaSemana', () => {
  it('usa o vocabulário do Cortex', () => {
    // 2026-08-28 é uma sexta-feira.
    expect(diaDaSemana('2026-08-28')).toBe('sex')
    expect(diaDaSemana('2026-08-29')).toBe('sab')
    expect(diaDaSemana('2026-08-30')).toBe('dom')
  })
})

describe('consultas do cardápio', () => {
  const c = { itens: ITENS, atualizadoEm: null }

  it('suplemento com dias só aparece no dia certo', () => {
    expect(suplementosDoDia(c, '2026-08-26').map(s => s.nome)).toEqual(['Creatina', 'Vitamina D'])
    expect(suplementosDoDia(c, '2026-08-25').map(s => s.nome)).toEqual(['Vitamina D'])
  })

  it('suplemento sem dias aparece todo dia', () => {
    // Ausência de `dias` é "sempre", não "nunca": é o padrão de quem cadastrou
    // o suplemento sem pensar em dia da semana.
    expect(suplementosDoDia(c, '2026-08-25').map(s => s.nome)).toContain('Vitamina D')
  })

  it('lista refeições e treinos', () => {
    expect(refeicoesDoPlano(c).map(r => r.nome)).toEqual(['Café da manhã'])
    expect(treinos(c).map(t => t.nome)).toEqual(['Peito e tríceps'])
  })

  it('lê os exercícios de um treino', () => {
    expect(exerciciosDoTreino(ITENS[3])).toEqual([{ nome: 'Supino reto', series: 4, reps: '8-10' }])
  })

  it('treino sem exercícios devolve lista vazia em vez de quebrar', () => {
    expect(exerciciosDoTreino({ especie: 'treino', nome: 'X', detalhe: {} })).toEqual([])
  })

  it('descarta exercício sem nome vindo do cardápio', () => {
    const t: ItemCardapio = {
      especie: 'treino', nome: 'X', detalhe: { exercicios: [{ series: 3 }, { nome: 'Rosca' }] }
    }
    expect(exerciciosDoTreino(t)).toEqual([{ nome: 'Rosca' }])
  })
})

describe('o que já foi marcado hoje', () => {
  it('começa vazio e lembra o que foi marcado', () => {
    const g = guardadoDeMemoria()
    expect(jaFeitos(g, '2026-08-28')).toEqual([])
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    expect(jaFeitos(g, '2026-08-28')).toEqual(['suplemento:Creatina'])
  })

  it('não repete a mesma marca', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    expect(jaFeitos(g, '2026-08-28')).toEqual(['suplemento:Creatina'])
  })

  it('separa os dias — o check volta desmarcado amanhã', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, '2026-08-28', 'suplemento:Creatina')
    expect(jaFeitos(g, '2026-08-29')).toEqual([])
  })

  it('esquece dias antigos ao gravar', () => {
    // Um mapa que cresce para sempre estoura o localStorage sem ninguém ver.
    const g = guardadoDeMemoria()
    marcarFeito(g, '2026-01-01', 'suplemento:Creatina')
    marcarFeito(g, '2026-08-28', 'suplemento:Whey')
    expect(jaFeitos(g, '2026-01-01')).toEqual([])
  })

  it('sobrevive a armazenamento corrompido', () => {
    expect(jaFeitos(guardadoDeMemoria({ 'cortex.feitos': 'nada disso' }), '2026-08-28')).toEqual([])
  })
})

describe('agenda no celular', () => {
  const HOJE = '2026-08-28'
  const c = {
    atualizadoEm: null,
    itens: [
      { especie: 'prova' as const, nome: 'ENEM',
        detalhe: { path: 'Estudos/Provas/ENEM.md', data: '2026-11-08', materia: 'geral' } },
      { especie: 'prova' as const, nome: 'P1 Fisica',
        detalhe: { path: 'Estudos/Provas/P1.md', data: '2026-09-02', estudado: true } },
      { especie: 'compromisso' as const, nome: 'Dentista',
        detalhe: { path: 'Agenda/Dentista.md', data: '2026-08-30', hora: '14:00' } },
      { especie: 'tarefa' as const, nome: 'Trabalho',
        detalhe: { path: 'Estudos/Trabalho.md', prazo: '2026-09-05' } }
    ]
  }

  it('separa por especie', () => {
    expect(provas(c).map(p => p.nome)).toEqual(['P1 Fisica', 'ENEM'])
    expect(compromissos(c).map(p => p.nome)).toEqual(['Dentista'])
    expect(tarefas(c).map(p => p.nome)).toEqual(['Trabalho'])
  })

  it('ordena pela data, do mais proximo ao mais distante', () => {
    expect(provas(c).map(p => p.detalhe.data)).toEqual(['2026-09-02', '2026-11-08'])
  })

  it('devolve o caminho de volta e a data, seja `data` ou `prazo`', () => {
    expect(caminhoDe(provas(c)[0])).toBe('Estudos/Provas/P1.md')
    expect(dataDe(tarefas(c)[0])).toBe('2026-09-05')
    expect(dataDe(compromissos(c)[0])).toBe('2026-08-30')
  })

  it('item sem caminho devolve string vazia em vez de quebrar', () => {
    expect(caminhoDe({ especie: 'prova', nome: 'X', detalhe: {} })).toBe('')
  })

  it('conta os dias que faltam em dias de calendario', () => {
    // Em milissegundos, uma prova as 8h de amanha "falta 0 dias" as 23h de
    // hoje, e a tela mentiria.
    expect(faltam('2026-08-28', HOJE)).toBe('hoje')
    expect(faltam('2026-08-29', HOJE)).toBe('amanhã')
    expect(faltam('2026-08-27', HOJE)).toBe('ontem')
    expect(faltam('2026-09-02', HOJE)).toBe('em 5 dias')
    expect(faltam('2026-08-25', HOJE)).toBe('há 3 dias')
  })

  it('data vazia ou torta nao vira texto errado', () => {
    expect(faltam('', HOJE)).toBe('')
    expect(faltam('nao e data', HOJE)).toBe('')
  })
})

describe('ordem das refeicoes', () => {
  const c = (itens: { nome: string; hora?: string }[]) => ({
    atualizadoEm: null,
    itens: itens.map(i => ({
      especie: 'refeicao' as const,
      nome: i.nome,
      detalhe: i.hora ? { hora: i.hora } : {}
    }))
  })

  it('segue o relogio, nao a ordem do banco', () => {
    // O almoco aparecer antes do cafe faz a pessoa procurar na lista o que
    // deveria estar na frente dela.
    const r = refeicoesDoPlano(c([
      { nome: 'Almoco', hora: '12:30' },
      { nome: 'Cafe', hora: '07:00' },
      { nome: 'Janta', hora: '20:00' }
    ]))
    expect(r.map(x => x.nome)).toEqual(['Cafe', 'Almoco', 'Janta'])
  })

  it('sem hora vai para o fim', () => {
    // Sem hora marcada ela e o extra, nao a primeira do dia.
    const r = refeicoesDoPlano(c([
      { nome: 'Ceia' },
      { nome: 'Cafe', hora: '07:00' }
    ]))
    expect(r.map(x => x.nome)).toEqual(['Cafe', 'Ceia'])
  })

  it('mesma hora desempata pelo nome, para a ordem nao dancar', () => {
    const r = refeicoesDoPlano(c([
      { nome: 'Lanche B', hora: '15:00' },
      { nome: 'Lanche A', hora: '15:00' }
    ]))
    expect(r.map(x => x.nome)).toEqual(['Lanche A', 'Lanche B'])
  })
})

describe('a data em si', () => {
  const HOJE = '2026-09-02'

  it('mostra dia e mes, sem o ano quando e o ano corrente', () => {
    expect(dataCurta('2026-09-12', HOJE)).toBe('12 set')
  })

  it('mostra o ano quando e outro', () => {
    expect(dataCurta('2027-01-05', HOJE)).toBe('5 jan 2027')
  })

  it('nao anda um dia para tras em fuso negativo', () => {
    // A armadilha: `new Date('2026-09-12')` e lido como UTC, e as 21h de
    // Brasilia isso ainda e dia 11 no relogio local. Por isso o Date e
    // montado a partir dos campos separados, nunca da string inteira.
    expect(dataCurta('2026-09-12', HOJE).startsWith('12 ')).toBe(true)
    expect(dataCurta('2026-01-01', HOJE)).toBe('1 jan')
  })

  it('data vazia ou torta nao inventa nada', () => {
    expect(dataCurta('', HOJE)).toBe('')
    expect(dataCurta('amanha', HOJE)).toBe('amanha')
  })

  it('anda junto com faltam, sem se contradizer', () => {
    // As duas aparecem lado a lado na tela: "12 set - em 10 dias".
    expect(dataCurta('2026-09-03', HOJE)).toBe('3 set')
    expect(faltam('2026-09-03', HOJE)).toBe('amanhã')
  })
})

describe('desmarcar o que foi marcado', () => {
  const DIA = '2026-09-02'

  it('tira a chave e deixa as outras', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, 'prova:A.md')
    marcarFeito(g, DIA, 'prova:B.md')
    desmarcarFeito(g, DIA, 'prova:A.md')
    expect(jaFeitos(g, DIA)).toEqual(['prova:B.md'])
  })

  it('desmarcar o que nao esta marcado nao faz nada', () => {
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, 'prova:A.md')
    desmarcarFeito(g, DIA, 'prova:Z.md')
    expect(jaFeitos(g, DIA)).toEqual(['prova:A.md'])
  })

  it('marcar de novo depois de desmarcar volta a valer', () => {
    // O ciclo que o botao "estudei" faz: marca, desfaz, marca.
    const g = guardadoDeMemoria()
    marcarFeito(g, DIA, 'prova:A.md')
    desmarcarFeito(g, DIA, 'prova:A.md')
    marcarFeito(g, DIA, 'prova:A.md')
    expect(jaFeitos(g, DIA)).toEqual(['prova:A.md'])
  })
})

describe('ha quanto tempo os dados chegaram', () => {
  const base = new Date('2026-09-02T12:00:00.000Z')
  const atras = (segundos: number): string =>
    new Date(base.getTime() - segundos * 1000).toISOString()

  it('acabou de chegar', () => {
    expect(haQuantoTempo(atras(0), base)).toBe('agora mesmo')
    expect(haQuantoTempo(atras(45), base)).toBe('agora mesmo')
  })

  it('minutos, horas e dias', () => {
    expect(haQuantoTempo(atras(5 * 60), base)).toBe('há 5 min')
    expect(haQuantoTempo(atras(3 * 3600), base)).toBe('há 3 h')
    expect(haQuantoTempo(atras(24 * 3600), base)).toBe('ontem')
    expect(haQuantoTempo(atras(3 * 24 * 3600), base)).toBe('há 3 dias')
  })

  it('sem data, ou com data torta, nao inventa nada', () => {
    // A tela esconde a linha quando isto vem vazio -- melhor nada do que
    // "Atualizado NaN".
    expect(haQuantoTempo(null, base)).toBe('')
    expect(haQuantoTempo('ontem de tarde', base)).toBe('')
  })

  it('relogio do celular atrasado nao vira tempo negativo', () => {
    // Acontece de verdade: o horario do aparelho anda sozinho, e "há -4 min"
    // faria a pessoa achar que o app esta quebrado.
    expect(haQuantoTempo(new Date(base.getTime() + 60_000).toISOString(), base))
      .toBe('agora mesmo')
  })
})

describe('a água do dia', () => {
  const com = (detalhe: Record<string, unknown>) => ({
    itens: [{ especie: 'hidratacao', nome: 'Água', detalhe }] as ItemCardapio[],
    atualizadoEm: null
  })

  it('lê meta, copo e total', () => {
    expect(hidratacao(com({ meta: 3500, copo: 800, ml: 1600 })))
      .toEqual({ nome: 'Água', meta: 3500, copo: 800, ml: 1600 })
  })

  it('sem a nota, a seção inteira some', () => {
    // `null`, e não um objeto zerado: um contador de uma meta que ninguém
    // definiu é pior do que seção nenhuma.
    expect(hidratacao({ itens: ITENS, atualizadoEm: null })).toBeNull()
  })

  it('sem `ml`, o dia começa em zero', () => {
    expect(hidratacao(com({ meta: 3500, copo: 800 }))?.ml).toBe(0)
  })

  it('sem `copo`, o botão ainda existe -- 250 ml é um copo comum', () => {
    expect(hidratacao(com({ meta: 3500 }))?.copo).toBe(250)
  })

  it('sem meta, o contador ainda conta -- só não há barra', () => {
    // `meta: 0` é o sinal que a tela usa para esconder a barra e mostrar só
    // o total. Contar sem alvo é melhor do que não contar.
    expect(hidratacao(com({ ml: 800 }))?.meta).toBe(0)
  })

  it('número torto vira o padrão, em vez de NaN na tela', () => {
    const h = hidratacao(com({ meta: 'muita', copo: -100, ml: 'dois copos' }))
    expect(h).toEqual({ nome: 'Água', meta: 0, copo: 250, ml: 0 })
  })
})

describe('litros', () => {
  it('mostra em litros, com vírgula', () => {
    // O celular é do Pedro: "1,6 L", não "1.6 L".
    expect(litros(1600)).toBe('1,6 L')
    expect(litros(3500)).toBe('3,5 L')
  })

  it('zero e o total redondo também vêm com a casa', () => {
    // "0 L" e "0,0 L" na mesma tela dançariam a largura do texto a cada gole.
    expect(litros(0)).toBe('0,0 L')
    expect(litros(2000)).toBe('2,0 L')
  })
})
