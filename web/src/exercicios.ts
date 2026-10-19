import type { ItemCardapio } from '@compartilhado/eventos'
import type { Guardado } from './guardado'

/**
 * Os exercícios no bolso.
 *
 * O pedido, nas palavras do dono: "tô na rua, esperando o ônibus, e aí eu
 * entro pra fazer um exercício pra ver se eu vou acertando — eu vou repetindo
 * várias vezes". Isso define o desenho, e o separa do simulado:
 *
 * - **Uma questão por vez, com correção na hora.** No simulado a correção vem
 *   no fim, porque lá o que se mede é a prova inteira. Aqui o valor está no
 *   retorno imediato: errou, lê o comentário, e a questão volta depois.
 * - **Repete.** A questão não sai do baralho por ter sido respondida uma vez;
 *   quem decide a próxima é o histórico — nunca vista primeiro, depois o que
 *   ele erra, e por último o que já acerta.
 * - **Funciona sem rede.** As questões vêm do cardápio, que mora no
 *   `localStorage`; o histórico também. Nada aqui precisa de internet.
 *
 * Esta é a lógica pura, fora da tela, porque errar nela é silencioso: um
 * sorteio viciado faria ele treinar sempre as mesmas seis questões e achar
 * que está indo bem.
 */

export type Questao = {
  n?: number
  materia?: string
  enunciado?: string
  a?: string; b?: string; c?: string; d?: string; e?: string
  gabarito?: string
  comentario?: string
}

/** Uma questão com a nota de onde veio — é o que dá a chave do histórico. */
export type Carta = {
  /** Identidade estável da questão: nota + número. */
  chave: string
  /** O título da nota de origem, para a tela dizer de onde saiu. */
  origem: string
  materia: string
  questao: Questao
}

export type Marca = { acertos: number; erros: number; visto: string }
export type Historico = Record<string, Marca>

const CHAVE = 'cortex.treino'

/** As espécies do cardápio que carregam exercícios. */
const COM_QUESTOES = ['materia', 'plano-dia']

function comoQuestoes(v: unknown): Questao[] {
  return Array.isArray(v) ? (v as Questao[]) : []
}

function txt(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Todas as cartas do baralho, tiradas do cardápio.
 *
 * Questão sem enunciado, sem gabarito ou com menos de duas alternativas fica
 * fora: ela não é respondível, e deixá-la entrar daria uma carta em branco no
 * meio do treino sem nada explicando por quê.
 */
export function cartasDoCardapio(itens: ItemCardapio[]): Carta[] {
  const out: Carta[] = []
  for (const item of itens) {
    if (!COM_QUESTOES.includes(item.especie)) continue
    const detalhe = item.detalhe as Record<string, unknown>
    comoQuestoes(detalhe.questoes).forEach((q, i) => {
      if (!q.enunciado || !q.gabarito) return
      const alternativas = (['a', 'b', 'c', 'd', 'e'] as const).filter(l => q[l])
      if (alternativas.length < 2) return
      out.push({
        chave: `${item.nome}#${q.n ?? i + 1}`,
        origem: item.nome,
        materia: q.materia ?? txt(detalhe.materia),
        questao: q
      })
    })
  }
  return out
}

/** As matérias presentes no baralho, em ordem alfabética e sem repetição. */
export function materiasDo(cartas: Carta[]): string[] {
  return [...new Set(cartas.map(c => c.materia).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function filtrarPorMateria(cartas: Carta[], materia: string | null): Carta[] {
  return materia ? cartas.filter(c => c.materia === materia) : cartas
}

/**
 * Quanto uma carta MERECE aparecer agora. Maior vem primeiro.
 *
 * A ordem é a do estudo, e não a do acaso:
 * 1. **Nunca vista** — material novo antes de revisão.
 * 2. **Errada mais vezes do que acertada** — é onde o treino rende.
 * 3. **Já acertada** — volta, mas por último, para o baralho não parecer só
 *    o que ele já sabe.
 *
 * `acertos` entra com sinal negativo para que acertar várias vezes empurre a
 * carta para o fim sem nunca removê-la: ele disse que quer repetir.
 */
export function peso(c: Carta, h: Historico): number {
  const m = h[c.chave]
  if (!m) return 1000
  return 100 + (m.erros * 10) - (m.acertos * 5)
}

/**
 * O baralho na ordem de estudo.
 *
 * `sorteio` é injetado para o teste poder ser determinístico — e porque um
 * `Math.random()` escondido aqui dentro tornaria a função impossível de
 * verificar. O empate entre cartas de mesmo peso é desfeito por ele: sem
 * isso, as questões de uma matéria viriam sempre na mesma ordem.
 */
export function baralho(
  cartas: Carta[], h: Historico, sorteio: () => number = Math.random
): Carta[] {
  return cartas
    .map(c => ({ c, p: peso(c, h) + sorteio() }))
    .sort((x, y) => y.p - x.p)
    .map(({ c }) => c)
}

export function registrar(h: Historico, chave: string, acertou: boolean, dia: string): Historico {
  const m = h[chave] ?? { acertos: 0, erros: 0, visto: '' }
  return {
    ...h,
    [chave]: {
      acertos: m.acertos + (acertou ? 1 : 0),
      erros: m.erros + (acertou ? 0 : 1),
      visto: dia
    }
  }
}

/**
 * O placar de hoje.
 *
 * Só de hoje, de propósito: o número que interessa a quem está no ponto de
 * ônibus é o desta sessão. Um acumulado de semanas viraria troféu, e troféu
 * não diz nada sobre o que ele acabou de responder.
 */
export function placarDoDia(h: Historico, dia: string): { certas: number; erradas: number } {
  let certas = 0
  let erradas = 0
  for (const m of Object.values(h)) {
    if (m.visto !== dia) continue
    certas += m.acertos
    erradas += m.erros
  }
  return { certas, erradas }
}

/**
 * As cartas que ele ainda erra mais do que acerta.
 *
 * É a lista que vale levar para o papel depois — e o motivo de o histórico
 * existir, em vez de só contar pontos.
 */
export function pendentes(cartas: Carta[], h: Historico): Carta[] {
  return cartas.filter(c => {
    const m = h[c.chave]
    return !!m && m.erros > m.acertos
  })
}

export function lerHistorico(g: Guardado): Historico {
  try {
    const bruto = g.ler(CHAVE)
    const o: unknown = bruto ? JSON.parse(bruto) : null
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const saida: Historico = {}
    for (const [chave, v] of Object.entries(o as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const m = v as Record<string, unknown>
      saida[chave] = {
        acertos: typeof m.acertos === 'number' ? m.acertos : 0,
        erros: typeof m.erros === 'number' ? m.erros : 0,
        visto: typeof m.visto === 'string' ? m.visto : ''
      }
    }
    return saida
  } catch {
    // JSON torto ou armazenamento bloqueado. Perder o histórico é ruim;
    // não abrir a tela de treino é pior.
    return {}
  }
}

export function gravarHistorico(g: Guardado, h: Historico): void {
  g.gravar(CHAVE, JSON.stringify(h))
}
