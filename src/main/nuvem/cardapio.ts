import type { ItemCardapio } from '../../shared/eventos'
import type { NoteComCampos } from '../index/queries'
import { txt, num, lista, listaDeTexto, comValor } from './util'

/*
 * Nota para quem acrescentar uma espécie nova aqui.
 *
 * A mesma lista existe em quatro lugares, e faltar em qualquer um deles faz a
 * espécie sumir em silêncio no meio do caminho:
 *   1. ESPECIES_CARDAPIO em src/shared/eventos.ts   (a definição)
 *   2. TIPOS_CARDAPIO em ./sincronizador.ts          (o que é lido do índice)
 *   3. publicar_cardapio em supabase/schema.sql      (a lista branca do banco)
 *   4. esta função                                   (o que vira item)
 * O app web já não tem cópia própria: ele importa a de (1).
 */

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

/**
 * Quantos dias para trás uma prova, tarefa ou compromisso continua sendo
 * publicado.
 *
 * Não é zero porque marcar "estudei" ou cancelar acontece depois do fato —
 * às vezes no dia seguinte, no ônibus. Não é trinta porque o celular é para
 * o que está chegando, e publicar histórico enche a tela e o banco.
 */
const JANELA_PASSADO_DIAS = 2

/** Compara datas ISO como texto; `YYYY-MM-DD` ordena igual em texto e no tempo. */
function aindaInteressa(data: string | null, hoje: string): boolean {
  if (!data) return false
  const d = new Date(`${hoje}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  d.setDate(d.getDate() - JANELA_PASSADO_DIAS)
  const dois = (n: number): string => String(n).padStart(2, '0')
  const limite = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
  return data >= limite
}

/**
 * Uma nota com o corpo já lido, quando ele importa.
 *
 * O corpo não vem do índice — a tabela `notes` guarda metadado, e o texto só
 * existe no FTS, que é para buscar. Quem lê do disco é `publicar()`, e só
 * para os dois tipos que publicam corpo. Assim `montarCardapio` continua uma
 * função pura sobre o que recebe, testável sem vault nem disco.
 */
export type NotaParaCardapio = NoteComCampos & { corpo?: string }

/**
 * Teto do corpo que sobe, em caracteres.
 *
 * Não é limite do banco: é a tela. Uma tarefa com passo a passo e links cabe
 * folgada aqui; o que passa disso é documento, e documento não se lê no
 * celular entre uma coisa e outra. Cortar avisando é melhor do que mandar
 * 200 KB de texto por item a cada publicação.
 */
const TETO_CORPO = 8000

/**
 * Esta nota pode ter o CORPO publicado?
 *
 * Duas perguntas, e as duas precisam ser sim.
 *
 * O tipo: só `rotina` e `anotacao`. Corpo é texto livre — o que cabe ali é
 * qualquer coisa —, e por isso quem entra nesta lista se decide aqui, uma
 * vez, e não caso a caso lá embaixo.
 *
 * A pasta: `Vida/Contas` e `Vida/Documentos` ficam de fora mesmo que uma nota
 * de tipo publicável apareça lá dentro. Hoje aquelas pastas guardam `conta` e
 * `documento`, que não sobem de jeito nenhum; mas uma anotação salva na pasta
 * errada não pode virar vazamento por causa de onde foi parar.
 *
 * Mora aqui, e exportada, porque é uma regra de segurança: precisa de teste
 * próprio, e não de um teste que a alcance de raspão por outro caminho.
 */
export function podePublicarCorpo(tipo: string | null | undefined, caminho: string): boolean {
  if (tipo !== 'rotina' && tipo !== 'anotacao') return false
  return !emPastaProtegida(caminho)
}

/**
 * A nota está numa pasta que nunca sai do computador?
 *
 * Senha e número de documento moram nessas duas. O corte normal é por TIPO —
 * `conta` e `documento` não estão em `TIPOS_NOTA_CARDAPIO` e nem chegam aqui
 * —, mas o tipo é escolhido no formulário e a pasta é onde o arquivo está.
 * Uma anotação salva em `Vida/Contas` seria uma nota de tipo publicável em
 * cima do lugar mais íntimo do vault, e passaria pelo corte por tipo.
 */
export function emPastaProtegida(caminho: string): boolean {
  const p = caminho.split('\\').join('/')
  return ['Vida/Contas/', 'Vida/Documentos/'].some(f => p.startsWith(f))
}

function corpoPublicavel(corpo: string | undefined): string | undefined {
  const t = (corpo ?? '').trim()
  if (!t) return undefined
  return t.length <= TETO_CORPO ? t : t.slice(0, TETO_CORPO) + '\n\n… (cortado)'
}

export function montarCardapio(notas: NotaParaCardapio[], hoje: string): ItemCardapio[] {
  const out: ItemCardapio[] = []

  /*
   * O que já foi marcado HOJE, lido do diário do dia.
   *
   * Existe porque o check do celular vivia só na memória do aparelho: o
   * Cortex não tinha como dizer "desmarquei este suplemento aqui", e as duas
   * telas divergiam em silêncio até a virada do dia.
   *
   * Dois campos, e não o diário inteiro. O diário também guarda gasto, treino
   * e anotação do dia — copiar o objeto todo aqui mandaria tudo isso para a
   * nuvem, que é exatamente o que a lista branca desta função existe para
   * impedir. `listaDeTexto` ainda garante que um objeto disfarçado de nome
   * não passe.
   */
  const diario = notas.find(x => x.tipo === 'diario' && x.date === hoje)
  const feitosHoje = {
    suplemento: new Set(listaDeTexto(diario?.campos.suplementos_feitos)),
    refeicao: new Set(listaDeTexto(diario?.campos.dieta_feitas)),
    rotina: new Set(listaDeTexto(diario?.campos.rotinas_feitas))
  }

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
        dias: listaDeTexto(n.campos.dias),
        // Só quando é verdade; `comValor` tira o `undefined`. O celular usa
        // isto para desenhar o check já marcado — e para desmarcá-lo quando
        // some daqui.
        feito: feitosHoje.suplemento.has(txt(n.title)) ? true : undefined
      })
    })
  }

  // A tarefa diária. Mesma forma do suplemento — no celular ela é o mesmo
  // gesto, logo abaixo dele.
  for (const n of notas.filter(x => x.tipo === 'rotina')) {
    out.push({
      especie: 'rotina',
      nome: txt(n.title),
      detalhe: comValor({
        quando: txt(n.campos.quando),
        dias: listaDeTexto(n.campos.dias),
        feito: feitosHoje.rotina.has(txt(n.title)) ? true : undefined,
        // O corpo da tarefa: passo a passo, links, o que for. Antes ele
        // ficava preso no computador e o celular mostrava só o nome — o
        // que não basta para quem escreveu instruções ali para seguir.
        corpo: corpoPublicavel(n.corpo)
      })
    })
  }

  /*
   * A agua do dia.
   *
   * Uma nota so: duas metas de agua nao fazem sentido, e a primeira vence.
   * O TOTAL nao vem da nota -- vem do diario, como todo registro do dia. E a
   * nota que diz a meta e o tamanho da garrafa, para o celular desenhar o
   * botao certo sem ninguem redigitar 800 toda vez.
   */
  const hidratacao = notas.find(x => x.tipo === 'hidratacao')
  if (hidratacao) {
    out.push({
      especie: 'hidratacao',
      nome: txt(hidratacao.title),
      detalhe: comValor({
        meta: num(hidratacao.campos.meta),
        copo: num(hidratacao.campos.copo),
        ml: num(diario?.campos.agua_ml)
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
      detalhe: comValor({
        hora: txt(r.hora), itens: txt(r.itens), kcal: num(r.kcal), prot: num(r.prot),
        feito: feitosHoje.refeicao.has(nome) ? true : undefined
      })
    })
  }

  // Provas e simulados que estão chegando. `path` vai junto porque é como o
  // celular devolve a referência ao dizer "estudei esta" — comparar por
  // título casaria duas provas de nome parecido.
  for (const n of notas.filter(x => x.tipo === 'prova' || x.tipo === 'simulado')) {
    if (!aindaInteressa(n.date, hoje)) continue
    out.push({
      especie: 'prova',
      nome: txt(n.title),
      detalhe: comValor({
        path: n.path,
        data: txt(n.date),
        materia: txt(n.campos.materia),
        local: txt(n.campos.local),
        // Só sobe quando é verdade; `comValor` tira o `undefined`.
        estudado: n.campos.estudado === true ? true : undefined,
        // As etapas do vestibular. `inscricao` é a CONFIGURAÇÃO — esta prova
        // tem inscrição a fazer —, e as outras duas são o ESTADO. Sem a
        // primeira o celular mostra "estudei", que é o que serve para prova
        // de cursinho; com ela, mostra a etapa que ainda falta.
        inscricao: n.campos.inscricao === true ? true : undefined,
        inscrito: n.campos.inscrito === true ? true : undefined,
        pago: n.campos.pago === true ? true : undefined
      })
    })
  }

  for (const n of notas.filter(x => x.tipo === 'evento')) {
    // Compromisso cancelado não vai para o celular: ele já sumiu da agenda
    // aqui, e mandá-lo daria ao celular um botão de cancelar o que não existe.
    if (n.campos.cancelado === true) continue
    if (!aindaInteressa(n.date, hoje)) continue
    out.push({
      especie: 'compromisso',
      nome: txt(n.title),
      detalhe: comValor({
        path: n.path,
        data: txt(n.date),
        hora: txt(n.campos.hora),
        local: txt(n.campos.local)
      })
    })
  }

  /*
   * As anotações de HOJE, e só as de hoje.
   *
   * Elas voltam para o celular para ele mostrar embaixo das tarefas do dia o
   * que acabou de escrever — sem isto a anotação some no instante em que sai,
   * e não há como conferir se saiu.
   *
   * `hoje` estrito, e não a janela de dois dias das provas: anotação não tem
   * prazo para cumprir, é o registro do dia. Mandar a semana inteira encheria
   * a tela do celular de coisa velha e o banco de texto que ninguém lê — o
   * histórico fica no vault, que é onde histórico mora.
   *
   * O texto sobe inteiro, de propósito: uma anotação cortada pela metade não
   * serve para conferir nada. `validarEvento` já limita a 8 KB na entrada, e
   * `titulo` e `texto` são os dois únicos campos que uma anotação tem.
   */
  for (const n of notas.filter(x => x.tipo === 'anotacao')) {
    /*
     * As de hoje, e as que não têm data.
     *
     * Antes era só `date === hoje`, e isso escondia uma classe inteira de
     * anotação: a permanente. Quem escreve "senha do wifi da casa da minha
     * mãe" não põe data nisso — não é registro do dia, é coisa para
     * consultar. Sem data, a nota nunca casava com `hoje` e nunca subia,
     * então o celular jamais a via. Com data, continua valendo o dia: um
     * diário de anotações antigas encheria a tela de coisa velha.
     */
    const data = txt(n.date)
    if (data && data !== hoje) continue
    // Nem o título: uma anotação guardada em `Vida/Contas` fala do que está
    // guardado lá, e o nome dela já entrega o assunto.
    if (emPastaProtegida(n.path)) continue
    out.push({
      especie: 'anotacao',
      nome: txt(n.title),
      detalhe: comValor({
        path: n.path,
        texto: txt(n.campos.texto),
        // Só quando é verdade — uma anotação comum não carrega
        // `prioridade: false` para o celular só para ele ignorar.
        prioridade: n.campos.prioridade === true ? true : undefined,
        // O corpo em markdown. `texto` é o resumo que o celular mandou ao
        // criar; o corpo é o que foi escrito no Cortex depois, e é onde
        // moram os links e as observações.
        corpo: corpoPublicavel(n.corpo),
        // Só quando é permanente: assim o celular sabe separar o recado de
        // hoje da anotação que fica.
        permanente: data ? undefined : true
      })
    })
  }

  for (const n of notas.filter(x => x.tipo === 'tarefa')) {
    if (!aindaInteressa(n.date, hoje)) continue
    out.push({
      especie: 'tarefa',
      nome: txt(n.title),
      detalhe: comValor({
        path: n.path,
        prazo: txt(n.date),
        materia: txt(n.campos.materia),
        feito: n.campos.feito === true ? true : undefined
      })
    })
  }

  /*
   * O porquinho: um item só, com o saldo somado e a meta ativa.
   *
   * O saldo é calculado AQUI e publicado pronto, em vez de mandar os
   * movimentos para o celular somar. Dois motivos: os movimentos são
   * lançamentos financeiros um a um, e o celular não precisa deles para
   * responder "quanto tenho?"; e a conta feita em dois lugares diverge no dia
   * em que alguém acrescentar um tipo de movimento e esquecer do outro lado.
   */
  const movimentos = notas.filter(x => x.tipo === 'porquinho')
  const meta = notas.find(x => x.tipo === 'meta-cofre' && x.campos.ativa === true)
  if (movimentos.length > 0 || meta) {
    const saldo = movimentos.reduce((soma, n) => {
      const v = num(n.campos.valor) ?? 0
      // 'sangria' é o vocabulário do Cortex para retirada.
      return txt(n.campos.direcao) === 'sangria' ? soma - v : soma + v
    }, 0)
    out.push({
      especie: 'porquinho',
      nome: meta ? txt(meta.title) : 'Porquinho',
      detalhe: comValor({
        // Arredonda ao centavo: somar float acumula 0.30000000000000004, e
        // esse número chegaria à tela do celular do jeito que está.
        saldo: Math.round(saldo * 100) / 100,
        alvo: meta ? num(meta.campos.alvo) : undefined,
        ate: meta ? txt(meta.date) : undefined
      })
    })
  }

  return out
}
