import type { Guardado } from './guardado'

const CHAVE = 'cortex.anotacoes'

/**
 * As anotações que ESTE aparelho escreveu hoje.
 *
 * Existe pelo mesmo motivo de `feitos.ts`: o app web não lê histórico. Sem
 * isto, escrever uma anotação e voltar para o Hoje mostraria a mesma tela de
 * antes — nada dizendo que ela saiu, e nada para conferir se saiu certo.
 *
 * Não é a verdade, e não pretende ser: a verdade é a nota no vault. Isto
 * cobre o intervalo entre o toque em Salvar e o Cortex devolver a anotação
 * pelo cardápio, que com o computador desligado dura o dia inteiro.
 *
 * Guarda só o dia informado na última gravação, como `feitos.ts` — o passado
 * está no vault, e um mapa que cresce para sempre é a maneira de estourar o
 * `localStorage` sem perceber.
 */
export type AnotacaoLocal = { texto: string; prioridade: boolean }

type Mapa = Record<string, AnotacaoLocal[]>

function ler(g: Guardado): Mapa {
  const bruto = g.ler(CHAVE)
  if (!bruto) return {}
  try {
    const cru = JSON.parse(bruto)
    return cru && typeof cru === 'object' && !Array.isArray(cru) ? (cru as Mapa) : {}
  } catch {
    return {}
  }
}

/** As anotações locais do dia, na ordem em que foram escritas. */
export function lerAnotacoes(g: Guardado, dia: string): AnotacaoLocal[] {
  const lista = ler(g)[dia]
  if (!Array.isArray(lista)) return []
  const out: AnotacaoLocal[] = []
  for (const a of lista) {
    // Vindo do `localStorage`, que qualquer script da página pode escrever:
    // linha torta é linha descartada, e não a tela inteira quebrada.
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    if (typeof o.texto !== 'string' || o.texto === '') continue
    out.push({ texto: o.texto, prioridade: o.prioridade === true })
  }
  return out
}

export function guardarAnotacao(
  g: Guardado, dia: string, texto: string, prioridade: boolean
): AnotacaoLocal[] {
  const limpo = texto.trim()
  if (!limpo) return lerAnotacoes(g, dia)
  const nova = [...lerAnotacoes(g, dia), { texto: limpo, prioridade }]
  // Só o dia informado sobrevive à gravação — é a poda dos dias antigos.
  g.gravar(CHAVE, JSON.stringify({ [dia]: nova }))
  return nova
}

/**
 * Tira da memória local o que o Cortex já devolveu.
 *
 * Sem isto a anotação apareceria duas vezes assim que o cardápio voltasse com
 * ela: uma vinda do vault, outra da cópia local que ninguém apagou.
 *
 * A comparação é pelo TEXTO, e não pelo título: o título é a primeira linha
 * cortada em 60 caracteres, então duas anotações que começam igual têm o
 * mesmo título e casariam uma pela outra — e a que ainda não chegou sumiria
 * da tela como se tivesse chegado.
 */
export function conciliarAnotacoes(
  g: Guardado, dia: string, doCortex: string[]
): AnotacaoLocal[] {
  const chegaram = new Set(doCortex.map(t => t.trim()))
  const atual = lerAnotacoes(g, dia)
  const restam = atual.filter(a => !chegaram.has(a.texto))
  if (restam.length !== atual.length) g.gravar(CHAVE, JSON.stringify({ [dia]: restam }))
  return restam
}
