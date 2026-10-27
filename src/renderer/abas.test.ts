import { describe, it, expect } from 'vitest'
import {
  criarAba, destinoDe, mesmoDestino, navegar, andar, podeVoltar, podeAvancar,
  abrirEmNova, fecharAba, girar, mover, tituloAba, type Aba, type Destino
} from './abas'

const d = (lente: string, sub: string, nota: string | null = null): Destino =>
  ({ lente, sub, nota })

const quatro = (): Aba[] => [
  criarAba(d('conhecimento', 'redacoes')),
  criarAba(d('conhecimento', 'repertorios')),
  criarAba(d('conhecimento', 'pomodoro')),
  criarAba(d('conhecimento', 'redacoes', 'Estudos/Redacoes/Tema 1.md'))
]

describe('criarAba', () => {
  it('da id diferente para abas no mesmo destino', () => {
    // Duas abas na mesma estrutura de redacao e um caso legitimo: comparar
    // duas versoes do mesmo texto. Id igual faria o React confundir as duas.
    const a = criarAba(d('conhecimento', 'redacoes'))
    const b = criarAba(d('conhecimento', 'redacoes'))
    expect(a.id).not.toBe(b.id)
  })

  it('nasce com um destino no historico, sem para onde voltar', () => {
    const a = criarAba(d('hoje', 'overview'))
    expect(destinoDe(a)).toEqual(d('hoje', 'overview'))
    expect(podeVoltar(a)).toBe(false)
    expect(podeAvancar(a)).toBe(false)
  })
})

describe('navegar', () => {
  it('empilha o destino novo e deixa para onde voltar', () => {
    const abas = navegar(quatro(), 1, d('conhecimento', 'cronograma'))
    expect(destinoDe(abas[1])).toEqual(d('conhecimento', 'cronograma'))
    expect(podeVoltar(abas[1])).toBe(true)
  })

  it('mexe so na aba da vez', () => {
    const antes = quatro()
    const abas = navegar(antes, 1, d('vida', 'metas'))
    expect(abas[0]).toBe(antes[0])
    expect(abas[2]).toBe(antes[2])
    expect(abas[3]).toBe(antes[3])
  })

  it('mantem o id da aba', () => {
    const abas = quatro()
    expect(navegar(abas, 0, d('saude', 'treinos'))[0].id).toBe(abas[0].id)
  })

  it('destino igual nao vira passo novo', () => {
    // Isto roda a cada mudanca de tela: sem a guarda, um render repetido
    // encheria o historico de copias e voltar nao sairia do lugar.
    const abas = quatro()
    expect(navegar(abas, 2, destinoDe(abas[2]))).toBe(abas)
  })

  it('andar para um destino novo descarta o que estava a frente', () => {
    // Voltar tres telas e clicar em outra coisa cria um caminho novo dali.
    let abas = quatro()
    abas = navegar(abas, 0, d('conhecimento', 'conteudos'))
    abas = navegar(abas, 0, d('conhecimento', 'simulados'))
    abas = andar(abas, 0, -1)!.abas
    expect(podeAvancar(abas[0])).toBe(true)
    abas = navegar(abas, 0, d('vida', 'compras'))
    expect(podeAvancar(abas[0])).toBe(false)
    expect(destinoDe(abas[0])).toEqual(d('vida', 'compras'))
  })

  it('indice fora da lista nao inventa aba', () => {
    const abas = quatro()
    expect(navegar(abas, 9, d('dev', 'codigo'))).toBe(abas)
    expect(navegar([], 0, d('dev', 'codigo'))).toEqual([])
  })

  it('o historico tem teto: aba aberta o dia todo nao cresce sem fim', () => {
    let abas = [criarAba(d('conhecimento', 'conteudos'))]
    for (let i = 0; i < 200; i++) abas = navegar(abas, 0, d('conhecimento', `aba-${i}`))
    expect(abas[0].historico.length).toBeLessThanOrEqual(60)
    // E o que sobra e o FIM do caminho, nao o comeco: voltar um passo tem que
    // cair no penultimo lugar visitado.
    expect(destinoDe(abas[0])).toEqual(d('conhecimento', 'aba-199'))
    expect(andar(abas, 0, -1)!.destino).toEqual(d('conhecimento', 'aba-198'))
  })
})

describe('andar', () => {
  it('volta para a nota em que a pessoa estava antes', () => {
    // O pedido, ao pe da letra: entrou num arquivo por outro arquivo, voltar
    // cai no arquivo anterior -- nao sai da aba.
    let abas = [criarAba(d('conhecimento', 'conteudos'))]
    abas = navegar(abas, 0, d('conhecimento', 'conteudos', 'Estudos/Conteudos/Fisica.md'))
    abas = navegar(abas, 0, d('conhecimento', 'conteudos', 'Estudos/Conteudos/Cinematica.md'))
    const r = andar(abas, 0, -1)!
    expect(r.destino.nota).toBe('Estudos/Conteudos/Fisica.md')
  })

  it('avancar desfaz o voltar', () => {
    let abas = [criarAba(d('conhecimento', 'conteudos'))]
    abas = navegar(abas, 0, d('conhecimento', 'simulados'))
    const voltou = andar(abas, 0, -1)!
    expect(voltou.destino).toEqual(d('conhecimento', 'conteudos'))
    const avancou = andar(voltou.abas, 0, 1)!
    expect(avancou.destino).toEqual(d('conhecimento', 'simulados'))
  })

  it('voltar numa aba nao mexe nas outras', () => {
    // As outras abas sao justamente o que a pessoa deixou parado onde estava.
    let abas = quatro()
    abas = navegar(abas, 2, d('conhecimento', 'cronograma'))
    const antes = abas[1]
    const r = andar(abas, 2, -1)!
    expect(r.abas[1]).toBe(antes)
    expect(destinoDe(r.abas[3])).toEqual(d('conhecimento', 'redacoes', 'Estudos/Redacoes/Tema 1.md'))
  })

  it('sem para onde ir, devolve null em vez de fingir que andou', () => {
    const abas = quatro()
    expect(andar(abas, 0, -1)).toBeNull()
    expect(andar(abas, 0, 1)).toBeNull()
    expect(andar(abas, 9, -1)).toBeNull()
  })
})

describe('abrirEmNova', () => {
  it('o primeiro Ctrl+clique guarda de onde a pessoa veio', () => {
    // Sem isso a tela de origem viraria a unica aba perdida: ela nunca
    // esteve na lista, porque a lista comeca vazia.
    const r = abrirEmNova([], 0, d('conhecimento', 'redacoes'), d('conhecimento', 'repertorios'))
    expect(r.abas.map(a => destinoDe(a).sub)).toEqual(['redacoes', 'repertorios'])
    expect(r.atual).toBe(1)
  })

  it('entra logo depois da aba atual, nao no fim', () => {
    const r = abrirEmNova(quatro(), 1, d('conhecimento', 'repertorios'), d('vida', 'metas'))
    expect(r.abas.map(a => destinoDe(a).sub))
      .toEqual(['redacoes', 'repertorios', 'metas', 'pomodoro', 'redacoes'])
    expect(r.atual).toBe(2)
  })

  it('a aba nova fica na frente', () => {
    const r = abrirEmNova(quatro(), 0, d('conhecimento', 'redacoes'), d('saude', 'treinos'))
    expect(destinoDe(r.abas[r.atual])).toEqual(d('saude', 'treinos'))
  })

  it('salva onde a aba de origem estava antes de sair dela', () => {
    // A pessoa navegou dentro da aba 0 (de redacoes para cronograma) e dali
    // deu Ctrl+clique. Voltar para a aba 0 tem que cair no cronograma.
    const r = abrirEmNova(quatro(), 0, d('conhecimento', 'cronograma'), d('vida', 'compras'))
    expect(destinoDe(r.abas[0])).toEqual(d('conhecimento', 'cronograma'))
  })

  it('a aba nova nao herda o caminho andado da outra', () => {
    // Herdar faria o botao de voltar levar a tela nova para um lugar onde ela
    // nunca esteve.
    let abas = [criarAba(d('conhecimento', 'conteudos'))]
    abas = navegar(abas, 0, d('conhecimento', 'simulados'))
    const r = abrirEmNova(abas, 0, d('conhecimento', 'simulados'), d('vida', 'metas'))
    expect(podeVoltar(r.abas[r.atual])).toBe(false)
    expect(podeVoltar(r.abas[0])).toBe(true)
  })

  it('abre tambem uma nota em aba propria', () => {
    const r = abrirEmNova(quatro(), 0, d('conhecimento', 'redacoes'),
      d('conhecimento', 'repertorios', 'Estudos/Repertorios/Banco.md'))
    expect(destinoDe(r.abas[r.atual]).nota).toBe('Estudos/Repertorios/Banco.md')
  })
})

describe('fecharAba', () => {
  it('fechar a da vez cai na vizinha da direita', () => {
    const r = fecharAba(quatro(), 1, 1)
    expect(r.atual).toBe(1)
    expect(r.abas.map(a => destinoDe(a).sub)).toEqual(['redacoes', 'pomodoro', 'redacoes'])
    expect(destinoDe(r.abas[r.atual]).sub).toBe('pomodoro')
  })

  it('fechar a ultima cai na da esquerda', () => {
    const r = fecharAba(quatro(), 3, 3)
    expect(r.atual).toBe(2)
    expect(r.abas).toHaveLength(3)
  })

  it('fechar uma aba a esquerda nao troca a tela', () => {
    const abas = quatro()
    const alvo = abas[2].id
    const r = fecharAba(abas, 2, 0)
    expect(r.abas[r.atual].id).toBe(alvo)
  })

  it('fechar uma aba a direita nao troca a tela', () => {
    const abas = quatro()
    const alvo = abas[1].id
    const r = fecharAba(abas, 1, 3)
    expect(r.abas[r.atual].id).toBe(alvo)
  })

  it('a ultima aba nao fecha', () => {
    const uma = [criarAba(d('hoje', 'overview'))]
    expect(fecharAba(uma, 0, 0).abas).toBe(uma)
  })

  it('indice invalido nao mexe em nada', () => {
    const abas = quatro()
    expect(fecharAba(abas, 0, -1).abas).toBe(abas)
    expect(fecharAba(abas, 0, 9).abas).toBe(abas)
  })
})

describe('girar', () => {
  it('anda para frente e da a volta', () => {
    expect(girar(4, 2, 1)).toBe(3)
    expect(girar(4, 3, 1)).toBe(0)
  })

  it('anda para tras e da a volta', () => {
    expect(girar(4, 1, -1)).toBe(0)
    expect(girar(4, 0, -1)).toBe(3)
  })

  it('sem aba nenhuma, fica em zero', () => {
    expect(girar(0, 0, 1)).toBe(0)
  })
})

describe('mesmoDestino', () => {
  it('a nota aberta conta na comparacao', () => {
    expect(mesmoDestino(d('conhecimento', 'redacoes'), d('conhecimento', 'redacoes'))).toBe(true)
    expect(mesmoDestino(
      d('conhecimento', 'redacoes'),
      d('conhecimento', 'redacoes', 'Estudos/Redacoes/Tema.md')
    )).toBe(false)
  })
})

describe('tituloAba', () => {
  const a = criarAba(d('conhecimento', 'redacoes', 'Estudos/Redacoes/Tema.md'))

  it('a nota aberta vence a area', () => {
    expect(tituloAba(a, { lente: 'Estudos', sub: 'Redações', nota: 'Tema 1' })).toBe('Tema 1')
  })

  it('sem nota, a sub-aba e mais especifica que a area', () => {
    expect(tituloAba(a, { lente: 'Estudos', sub: 'Redações' })).toBe('Redações')
  })

  it('area sem sub-aba usa o nome da area', () => {
    expect(tituloAba(criarAba(d('cerebro', 'overview')), { lente: 'Rede neural' }))
      .toBe('Rede neural')
  })

  it('sem nome nenhum, cai no id da lente em vez de ficar em branco', () => {
    expect(tituloAba(criarAba(d('dev', 'codigo')), {})).toBe('dev')
  })
})

describe('mover', () => {
  const quatro = () => [
    criarAba(d('hoje', '')), criarAba(d('vida', 'metas')),
    criarAba(d('saude', 'treinos')), criarAba(d('conhecimento', 'cronograma'))
  ]

  it('arrasta uma aba para a direita', () => {
    const r = mover(quatro(), 0, 2, 0)
    expect(r.abas.map(a => destinoDe(a).lente))
      .toEqual(['vida', 'saude', 'hoje', 'conhecimento'])
  })

  it('arrasta para a esquerda', () => {
    const r = mover(quatro(), 3, 0, 3)
    expect(r.abas.map(a => destinoDe(a).lente))
      .toEqual(['conhecimento', 'hoje', 'vida', 'saude'])
  })

  it('a aba ARRASTADA continua sendo a ativa', () => {
    // Senao arrastar a aba em que se trabalha jogaria o trabalho para outra.
    const r = mover(quatro(), 0, 3, 0)
    expect(r.atual).toBe(3)
  })

  it('arrastar outra aba por cima da ativa desloca o indice', () => {
    /* A posicao ativa e um indice: mexer na lista por baixo dele faria o
       mesmo numero apontar para outra aba. */
    const r = mover(quatro(), 0, 3, 1)   // ativa era a 1, a 0 foi para o fim
    expect(r.atual).toBe(0)
    expect(destinoDe(r.abas[0]!).lente).toBe('vida')
  })

  it('arrastar de tras para frente tambem acerta o indice', () => {
    const r = mover(quatro(), 3, 0, 1)   // ativa era a 1
    expect(r.atual).toBe(2)
    expect(destinoDe(r.abas[2]!).lente).toBe('vida')
  })

  it('soltar no mesmo lugar nao mexe em nada', () => {
    const antes = quatro()
    const r = mover(antes, 1, 1, 1)
    expect(r.abas).toBe(antes)
    expect(r.atual).toBe(1)
  })

  it('indice invalido nao quebra a lista', () => {
    const antes = quatro()
    expect(mover(antes, -1, 2, 0).abas).toBe(antes)
    expect(mover(antes, 0, 9, 0).abas).toBe(antes)
  })
})
