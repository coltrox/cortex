import type { ItemCardapio } from '../../shared/eventos'
import type { NoteComCampos } from '../index/queries'
import { txt, num, lista, listaDeTexto, comValor } from './util'

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
 *
 * `txt`/`num`/`lista`/`listaDeTexto`/`comValor` vêm de `./util` — mesma
 * guarda endurecida usada por `planejar.ts`, para as duas pontas que lidam
 * com dado hostil de fora não divergirem de novo (ver comentário em `util.ts`).
 */

export function montarCardapio(notas: NoteComCampos[]): ItemCardapio[] {
  const out: ItemCardapio[] = []

  for (const n of notas.filter(x => x.tipo === 'treino-modelo')) {
    out.push({
      especie: 'treino',
      // txt() aqui, não n.title direto: a garantia de que title é string
      // mora em indexer.ts, fora do controle desta função. Se isso mudar, ou
      // se alguém chamar montarCardapio por outro caminho, txt() segura.
      nome: txt(n.title),
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
      nome: txt(n.title),
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
