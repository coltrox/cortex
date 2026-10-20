import type { Guardado } from './guardado'

/**
 * A sessão de estudos: o treino com começo, fim e relatório.
 *
 * O pedido, nas palavras do dono: "eu quero iniciar uma sessão de estudos e
 * aí todos os exercícios que eu fizer, eu quero que você marque depois sessão
 * de estudos tal de tal dia, de tal horário, e quantos exercícios de cada
 * matéria eu acertei, quantos que eu errei, os conteúdos que eu mais fui bem,
 * os que eu mais fui mal".
 *
 * Isto é outra coisa do que o histórico de `exercicios.ts`, e por isso vive
 * num módulo próprio:
 *
 * - O **histórico** é por questão e para sempre; serve para escolher qual
 *   carta volta antes. Não tem noção de começo nem de fim.
 * - A **sessão** é um recorte: das 14h30 às 15h10, tanto de cada matéria.
 *   É o que vira nota no vault e responde "como foi o treino de hoje".
 *
 * Os dois convivem: responder uma questão alimenta ambos.
 *
 * Tudo mora no aparelho enquanto a sessão está aberta — ele treina sem sinal,
 * e perder o relatório por falta de rede seria perder o treino. Só no
 * "encerrar" sai um evento para o Cortex escrever a nota.
 */

/** Uma questão respondida dentro da sessão. */
export type RespostaSessao = {
  /** A mesma identidade do histórico: nota + número. */
  chave: string
  materia: string
  /** A nota de onde a questão saiu — é o "conteúdo" do relatório. */
  conteudo: string
  acertou: boolean
}

export type SessaoEstudo = {
  /** Começo, em hora LOCAL: `2026-10-20T14:30`. */
  inicio: string
  respostas: RespostaSessao[]
}

/** Quanto se acertou de alguma coisa — de uma matéria ou de um conteúdo. */
export type Placar = {
  nome: string
  certas: number
  erradas: number
  total: number
  /** De 0 a 1. Com `total` zero, zero — e não NaN. */
  taxa: number
}

const CHAVE = 'cortex.sessao-estudo'

/**
 * Quantas questões uma matéria precisa ter para entrar no "fui bem" ou no
 * "fui mal".
 *
 * Sem este piso, acertar a única questão de física que apareceu colocaria
 * física como o melhor assunto do dia, com 100%. Três é pouco para ser
 * estatística e o bastante para não ser sorte — e o relatório é para orientar
 * o estudo de amanhã, não para premiar.
 */
export const MINIMO_PARA_DESTAQUE = 3

/** Hora local no formato que a sessão usa. Nunca `toISOString()`. */
export function marcaDeTempo(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function iniciar(agora: Date): SessaoEstudo {
  return { inicio: marcaDeTempo(agora), respostas: [] }
}

/**
 * Anota uma resposta.
 *
 * A mesma questão pode entrar duas vezes: no treino ele repete de propósito,
 * e as duas tentativas contam. Guardar por chave única esconderia justamente
 * a segunda, que é a que mostra se ele aprendeu.
 */
export function anotar(s: SessaoEstudo, r: RespostaSessao): SessaoEstudo {
  return { ...s, respostas: [...s.respostas, r] }
}

/** O dia da sessão, para o evento. */
export function diaDaSessao(s: SessaoEstudo): string {
  return s.inicio.slice(0, 10)
}

/** `2026-10-20T14:30` → `14h30`. */
export function rotuloDeHora(marca: string): string {
  const hhmm = marca.slice(11, 16)
  return hhmm ? hhmm.replace(':', 'h') : ''
}

/** Minutos entre o começo e o fim. Nunca negativo. */
export function minutos(inicio: string, fim: string): number {
  const a = Date.parse(inicio)
  const b = Date.parse(fim)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 60000))
}

function taxaDe(certas: number, total: number): number {
  return total > 0 ? certas / total : 0
}

/**
 * Agrupa as respostas por matéria ou por conteúdo.
 *
 * Ordem: pior aproveitamento primeiro. O relatório existe para dizer o que
 * estudar em seguida, e o que está no fim da lista é o que já está resolvido.
 * Empate desfeito por quem teve mais questões, e depois pelo nome, para a
 * lista não dançar entre dois relatórios iguais.
 */
export function placares(
  respostas: RespostaSessao[], por: 'materia' | 'conteudo'
): Placar[] {
  const mapa = new Map<string, Placar>()
  for (const r of respostas) {
    const nome = (por === 'materia' ? r.materia : r.conteudo) || 'sem matéria'
    const p = mapa.get(nome) ?? { nome, certas: 0, erradas: 0, total: 0, taxa: 0 }
    if (r.acertou) p.certas += 1
    else p.erradas += 1
    p.total += 1
    p.taxa = taxaDe(p.certas, p.total)
    mapa.set(nome, p)
  }
  return [...mapa.values()].sort((a, b) =>
    a.taxa - b.taxa ||
    b.total - a.total ||
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
}

/** O total da sessão inteira. */
export function totalGeral(respostas: RespostaSessao[]): Placar {
  const certas = respostas.filter(r => r.acertou).length
  return {
    nome: 'total',
    certas,
    erradas: respostas.length - certas,
    total: respostas.length,
    taxa: taxaDe(certas, respostas.length)
  }
}

/**
 * Onde ele foi bem e onde foi mal, só entre quem tem questões suficientes.
 *
 * Devolve listas, e não um vencedor: com dois conteúdos empatados em 40%,
 * eleger um e esconder o outro faria o relatório mentir por omissão.
 */
export function destaques(ps: Placar[]): { bem: Placar[]; mal: Placar[] } {
  const elegiveis = ps.filter(p => p.total >= MINIMO_PARA_DESTAQUE)
  if (elegiveis.length === 0) return { bem: [], mal: [] }

  const melhor = Math.max(...elegiveis.map(p => p.taxa))
  const pior = Math.min(...elegiveis.map(p => p.taxa))
  // Tudo com o mesmo aproveitamento não tem melhor nem pior: apontar os dois
  // lados da mesma lista seria ruído.
  if (melhor === pior) return { bem: [], mal: [] }

  return {
    bem: elegiveis.filter(p => p.taxa === melhor),
    mal: elegiveis.filter(p => p.taxa === pior)
  }
}

export function porcentagem(taxa: number): number {
  return Math.round(taxa * 100)
}

/** Os dados que vão no evento, já somados. O Cortex escreve a nota a partir disto. */
export type ResumoSessao = {
  inicio: string
  fim: string
  minutos: number
  materias: Placar[]
  conteudos: Placar[]
}

export function resumir(s: SessaoEstudo, fim: Date): ResumoSessao {
  const marca = marcaDeTempo(fim)
  return {
    inicio: s.inicio,
    fim: marca,
    minutos: minutos(s.inicio, marca),
    materias: placares(s.respostas, 'materia'),
    conteudos: placares(s.respostas, 'conteudo')
  }
}

/* ---------- a sessão guardada no aparelho ---------- */

/**
 * A sessão aberta, se houver.
 *
 * Volta `null` em qualquer sinal de dado torto. Uma sessão meio lida daria um
 * relatório errado, e relatório errado é pior do que relatório nenhum: ele
 * usaria isso para decidir o que estudar.
 */
export function lerSessao(g: Guardado): SessaoEstudo | null {
  try {
    const bruto = g.ler(CHAVE)
    if (!bruto) return null
    const o: unknown = JSON.parse(bruto)
    if (!o || typeof o !== 'object') return null
    const s = o as Record<string, unknown>
    if (typeof s.inicio !== 'string' || !s.inicio) return null
    const cruas = Array.isArray(s.respostas) ? s.respostas : []
    const respostas: RespostaSessao[] = []
    for (const c of cruas) {
      if (!c || typeof c !== 'object') continue
      const r = c as Record<string, unknown>
      if (typeof r.chave !== 'string') continue
      respostas.push({
        chave: r.chave,
        materia: typeof r.materia === 'string' ? r.materia : '',
        conteudo: typeof r.conteudo === 'string' ? r.conteudo : '',
        acertou: r.acertou === true
      })
    }
    return { inicio: s.inicio, respostas }
  } catch {
    return null
  }
}

export function gravarSessao(g: Guardado, s: SessaoEstudo): void {
  g.gravar(CHAVE, JSON.stringify(s))
}

export function limparSessao(g: Guardado): void {
  g.apagar(CHAVE)
}
