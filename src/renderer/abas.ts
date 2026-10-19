/**
 * As abas do Cortex, estilo navegador.
 *
 * Uma aba é um CAMINHO ANDADO: a lista de destinos por onde ela passou e onde
 * ela está nessa lista. Um destino é a área, a sub-aba dentro dela e, se
 * houver, a nota aberta. Nada de conteúdo mora aqui — quem desenha a tela
 * continua sendo a lente, a partir do destino da vez.
 *
 * Dois pedidos moldaram isto, e os dois juntos é que explicam o desenho:
 *
 * 1. Deixar a estrutura da redação, os repertórios, o pomodoro e a escrita
 *    abertos ao mesmo tempo, trocando entre eles sem perder onde cada um
 *    estava — por isso são várias abas.
 * 2. Os botões laterais do mouse voltando e avançando "no arquivo que eu
 *    estava antes, não para a aba inteira" — por isso o histórico é POR ABA,
 *    e não um só do app. Voltar numa aba não pode mexer nas outras: elas são
 *    justamente o que a pessoa deixou parado onde estava.
 *
 * A regra fica fora da tela porque errar nela é fácil e o estrago é grande:
 * fechar a aba errada, voltar e levar o estado da aba vizinha junto, ou
 * perder o caminho andado ao abrir uma nota.
 */

export type Destino = {
  lente: string
  sub: string
  /** O caminho da nota aberta, se a aba estiver dentro de uma. */
  nota: string | null
}

export type Aba = {
  id: string
  /** Por onde esta aba passou, do mais antigo ao mais novo. Nunca vazio. */
  historico: Destino[]
  /** Onde ela está no próprio histórico. Voltar anda para trás; avançar, para frente. */
  pos: number
}

/**
 * Contador dos ids.
 *
 * Id próprio, e não a posição na lista: a posição muda quando se fecha uma
 * aba à esquerda, e o React reusaria o estado do componente errado. E não
 * `lente:sub`, porque duas abas no MESMO destino são legítimas — abrir a
 * mesma estrutura de redação duas vezes para comparar é exatamente o caso.
 */
let seq = 0

export function criarAba(d: Destino): Aba {
  seq += 1
  return { id: `aba-${seq}`, historico: [d], pos: 0 }
}

/** Onde a aba está agora. */
export function destinoDe(a: Aba): Destino {
  return a.historico[a.pos] ?? a.historico[a.historico.length - 1]
}

export function mesmoDestino(a: Destino, b: Destino): boolean {
  return a.lente === b.lente && a.sub === b.sub && a.nota === b.nota
}

/**
 * Quantos destinos uma aba guarda.
 *
 * Um teto existe porque o histórico cresce a cada clique e a aba vive o dia
 * inteiro aberta; sem ele, uma tarde de estudo acumularia milhares de
 * destinos na memória. 60 passos para trás é mais do que qualquer pessoa
 * desfaz de uma vez.
 */
const TETO = 60

/**
 * Anda para um destino novo, a partir de onde a aba está.
 *
 * O que estava À FRENTE é descartado, como em qualquer navegador: voltar três
 * telas e clicar em outra coisa cria um caminho novo dali, e manter o antigo
 * faria o botão de avançar levar a um lugar que não tem mais relação com o
 * que está na tela.
 *
 * Destino igual ao de agora não vira passo novo. Isto é chamado a cada
 * mudança de tela, e sem essa guarda um render repetido encheria o histórico
 * de cópias e o botão de voltar não sairia do lugar.
 */
export function navegar(abas: Aba[], atual: number, d: Destino): Aba[] {
  const a = abas[atual]
  if (!a) return abas
  if (mesmoDestino(destinoDe(a), d)) return abas
  const andado = [...a.historico.slice(0, a.pos + 1), d]
  const cortado = andado.slice(Math.max(0, andado.length - TETO))
  const out = [...abas]
  out[atual] = { ...a, historico: cortado, pos: cortado.length - 1 }
  return out
}

export function podeVoltar(a: Aba | undefined): boolean {
  return !!a && a.pos > 0
}

export function podeAvancar(a: Aba | undefined): boolean {
  return !!a && a.pos < a.historico.length - 1
}

/**
 * Anda no histórico da aba da vez, sem tocar nas outras.
 *
 * Devolve a lista nova E o destino a aplicar na tela, porque quem chama
 * precisa dos dois ao mesmo tempo: mudar `pos` sem aplicar o destino deixaria
 * a aba apontando para um lugar que a tela não está mostrando. `null` quando
 * não há para onde ir — e aí nada muda.
 */
export function andar(
  abas: Aba[], atual: number, passo: -1 | 1
): { abas: Aba[]; destino: Destino } | null {
  const a = abas[atual]
  if (!a) return null
  const pos = a.pos + passo
  if (pos < 0 || pos >= a.historico.length) return null
  const out = [...abas]
  out[atual] = { ...a, pos }
  return { abas: out, destino: a.historico[pos] }
}

/**
 * Abre um destino em aba nova, LOGO DEPOIS da atual.
 *
 * Depois, e não no fim da fila: a aba nova nasceu de um clique na de agora, e
 * é ao lado dela que a pessoa espera encontrá-la — é o que todo navegador faz.
 *
 * `abas` vazio é o estado normal de quem nunca usou abas. Nesse caso a lista
 * nasce com duas: a de onde a pessoa estava (`agora`) e a nova. Sem isso o
 * primeiro Ctrl+clique perderia a tela de origem.
 *
 * A aba nova começa com histórico só dela. Herdar o caminho da aba de origem
 * faria o botão de voltar levar a tela nova para um lugar onde ela nunca
 * esteve.
 */
export function abrirEmNova(
  abas: Aba[], atual: number, agora: Destino, destino: Destino
): { abas: Aba[]; atual: number } {
  if (abas.length === 0) {
    return { abas: [criarAba(agora), criarAba(destino)], atual: 1 }
  }
  const base = navegar(abas, atual, agora)
  const i = Math.min(Math.max(atual, 0), base.length - 1)
  const out = [...base]
  out.splice(i + 1, 0, criarAba(destino))
  return { abas: out, atual: i + 1 }
}

/**
 * Fecha uma aba e diz qual fica na frente.
 *
 * Fechar a aba da vez cai na vizinha da DIREITA, como no navegador; na última,
 * cai na da esquerda. Fechar uma aba que não é a da vez não pode mudar a tela:
 * o índice atual anda junto para continuar apontando para a mesma aba.
 *
 * A última aba não fecha. Sobrar zero aba exigiria uma tela de "nada aberto"
 * que não existe, e o botão de fechar nem aparece quando só há uma.
 */
export function fecharAba(
  abas: Aba[], atual: number, i: number
): { abas: Aba[]; atual: number } {
  if (abas.length <= 1 || i < 0 || i >= abas.length) return { abas, atual }
  const out = abas.filter((_, k) => k !== i)
  if (i > atual) return { abas: out, atual }
  if (i < atual) return { abas: out, atual: atual - 1 }
  return { abas: out, atual: Math.min(i, out.length - 1) }
}

/**
 * A próxima aba, dando a volta.
 *
 * Dá a volta de propósito: com quatro abas, o atalho tem que girar entre elas
 * para sempre, e parar na última seria um atalho que às vezes não faz nada.
 */
export function girar(total: number, atual: number, passo: number): number {
  if (total <= 0) return 0
  return (((atual + passo) % total) + total) % total
}

/**
 * O rótulo da aba.
 *
 * A nota aberta vence a área: quem está escrevendo uma redação quer ver o
 * título dela na aba, não "Estudos". Sem nota, o nome da sub-aba é mais
 * específico que o da área e diz melhor o que tem ali dentro.
 */
export function tituloAba(
  a: Aba, nomes: { lente?: string; sub?: string; nota?: string }
): string {
  return nomes.nota || nomes.sub || nomes.lente || destinoDe(a).lente
}
