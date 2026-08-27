import type { ItemCardapio } from '../../shared/eventos'
import type { NoteComCampos } from '../index/queries'

/**
 * O que o Cortex publica — e nada além.
 *
 * Esta é a única função do app que envia dado do vault para fora. Ela é
 * escrita por LISTA BRANCA: cada espécie declara os campos que copia, um a
 * um. Nunca espalhe `...campos` aqui, e nunca copie um objeto inteiro vindo
 * do frontmatter: é assim que uma carga, um valor ou uma senha acabaria
 * subindo junto sem ninguém perceber.
 *
 * `cardapio.test.ts` monta um vault com senha, número de documento, valor de
 * gasto e carga, e falha se qualquer um deles aparecer no JSON publicado.
 */

// Só escalar vira texto — `String(v)` de um array junta os elementos com
// vírgula (recursivamente), então um array escapa junto sem que ninguém peça.
const txt = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''

/** Só número de verdade sobe — um objeto disfarçado de kcal não é escalar. */
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(i => i && typeof i === 'object') as Record<string, unknown>[] : []

/** Lista de strings simples — um dia da semana é 'seg', nunca um objeto com motivo anexado. */
const listaDeTexto = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** Só entra no detalhe o que tem valor — chave vazia polui a tela do celular. */
function comValor(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}

export function montarCardapio(notas: NoteComCampos[]): ItemCardapio[] {
  const out: ItemCardapio[] = []

  for (const n of notas.filter(x => x.tipo === 'treino-modelo')) {
    out.push({
      especie: 'treino',
      nome: n.title,
      detalhe: comValor({
        grupo: txt(n.campos.grupo),
        // Campo a campo: `series` e `reps` são estrutura, `carga` é histórico.
        exercicios: lista(n.campos.exercicios).map(e => comValor({
          nome: txt(e.nome),
          series: num(e.series),
          reps: txt(e.reps)
        }))
      })
    })
  }

  for (const n of notas.filter(x => x.tipo === 'suplemento')) {
    out.push({
      especie: 'suplemento',
      nome: n.title,
      detalhe: comValor({
        dose: txt(n.campos.dose),
        quando: txt(n.campos.quando),
        // Item a item, igual exercicios/refeicoes: um objeto disfarçado de dia não passa.
        dias: listaDeTexto(n.campos.dias)
      })
    })
  }

  // Só o plano ativo: publicar todos os planos faria o celular perguntar qual
  // usar, e essa escolha já foi feita no Cortex.
  const ativo = notas.find(x => x.tipo === 'plano' && x.campos.ativo === true)
  for (const r of lista(ativo?.campos.refeicoes)) {
    const nome = txt(r.nome)
    if (!nome) continue
    out.push({
      especie: 'refeicao',
      nome,
      detalhe: comValor({ hora: txt(r.hora), itens: txt(r.itens), kcal: num(r.kcal), prot: num(r.prot) })
    })
  }

  return out
}
