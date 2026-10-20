import type { Guardado } from './guardado'

/**
 * Os checks das tarefas de uma nota, marcados no celular.
 *
 * O plano do dia tem `- [ ]` para cada coisa a fazer, e no computador um
 * clique risca a linha dentro do arquivo. No celular isso não dá: o aparelho
 * lê o vault, mas ainda não escreve nele.
 *
 * Então o check mora AQUI, no próprio aparelho. É uma marcação pessoal de
 * progresso — serve para saber o que já foi feito hoje enquanto se estuda
 * fora de casa, e não volta para o vault.
 *
 * É uma limitação declarada, não um descuido: a tela diz que a marcação é só
 * deste aparelho. Fingir que sincroniza seria pior — ele marcaria no ônibus,
 * abriria o Cortex em casa e veria tudo desmarcado sem entender por quê.
 */

const CHAVE = 'cortex.marcados'

export type Marcados = Record<string, true>

/** A identidade de uma tarefa: a nota e a posição dela na lista. */
export function chaveDaTarefa(nota: string, indice: number): string {
  return `${nota}#${indice}`
}

export function lerMarcados(g: Guardado): Marcados {
  try {
    const bruto = g.ler(CHAVE)
    const o: unknown = bruto ? JSON.parse(bruto) : null
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const saida: Marcados = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v === true) saida[k] = true
    }
    return saida
  } catch {
    // Armazenamento bloqueado ou JSON torto: começar sem marcação é melhor
    // que não abrir a nota.
    return {}
  }
}

export function gravarMarcados(g: Guardado, m: Marcados): void {
  g.gravar(CHAVE, JSON.stringify(m))
}

/**
 * Liga ou desliga uma tarefa.
 *
 * Desmarcar REMOVE a chave em vez de gravar `false`: o mapa só guarda o que
 * está feito, e assim ele não cresce para sempre com tarefas desmarcadas de
 * dias que já passaram.
 */
export function alternar(m: Marcados, chave: string): Marcados {
  const out = { ...m }
  if (out[chave]) delete out[chave]
  else out[chave] = true
  return out
}

/**
 * Esta tarefa está feita?
 *
 * O `- [x]` escrito no arquivo VENCE: se o Cortex já marcou lá, está feito,
 * independentemente do que este aparelho guardou.
 */
export function estaFeita(m: Marcados, chave: string, feitaNoTexto: boolean): boolean {
  return feitaNoTexto || m[chave] === true
}
