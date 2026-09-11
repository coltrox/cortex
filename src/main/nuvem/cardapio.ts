import type { ItemCardapio } from '../../shared/eventos'
import type { NoteComCampos } from '../index/queries'
import { semDependenciasDaRede } from '../../shared/corpo'
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
 * O tipo: só `rotina`. Corpo é texto livre — o que cabe ali é qualquer coisa
 * —, e por isso quem entra nesta lista se decide aqui, uma vez, e não caso a
 * caso lá embaixo.
 *
 * `anotacao` SAIU da lista em 11/09/2026, a pedido do dono: "essa é a
 * estrutura de uma anotação, não é para mostrar o que tem dentro da nota e
 * ponto final". E ele tem razão sobre este vault — a anotação do celular é
 * uma linha, o conteúdo mora no próprio título, e o corpo do arquivo é só o
 * rodapé de links que o app escreve em toda nota nova. Era isso que subia.
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
  if (tipo !== 'rotina') return false
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

/**
 * Prepara o corpo que sobe.
 *
 * A limpeza mora em `shared/corpo`, e não aqui, porque o celular precisa dela
 * também: ele desenha na hora o que já está publicado, sem esperar o Cortex
 * republicar. Duas cópias divergiriam.
 *
 * A limpeza roda ANTES do corte de tamanho, de propósito: assim o teto de
 * caracteres mede o texto que a pessoa vai de fato ler.
 */
function corpoPublicavel(corpo: string | undefined): string | undefined {
  const t = semDependenciasDaRede((corpo ?? '').trim())
  if (!t) return undefined
  return t.length <= TETO_CORPO ? t : t.slice(0, TETO_CORPO) + '\n\n… (cortado)'
}

/**
 * Monta o cardápio.
 *
 * `areasLigadas` são as áreas que o dono marcou no Cortex (ver `AREAS` em
 * `main/config.ts`). Elas viajam para o celular espelharem a mesma escolha:
 * quem não liga Estudos não vê nada de estudos no app do celular — nem tela,
 * nem atalho, nem seção. O parâmetro é obrigatório de propósito, para que
 * esquecer de passá-lo seja erro de compilação e não uma tela vazia.
 */
export function montarCardapio(
  notas: NotaParaCardapio[], hoje: string, areasLigadas: string[]
): ItemCardapio[] {
  const out: ItemCardapio[] = []

  /*
   * As áreas ligadas, uma por item.
   *
   * Um item por área, e não uma lista dentro de um item, porque o cardápio é
   * uma tabela com chave `(especie, nome)` no banco — uma lista dentro de
   * `detalhe` viraria uma linha só, que se sobrescreve.
   */
  for (const a of areasLigadas) out.push({ especie: 'area', nome: a, detalhe: {} })

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

  /*
   * Quanto de cada refeição foi comido hoje, e o que entrou no lugar.
   *
   * Campo a campo, como todo o resto desta função: o item vem do frontmatter,
   * que pode ter sido editado à mão, e espalhar o objeto aqui mandaria para a
   * nuvem qualquer chave que alguém tenha escrito dentro dele.
   *
   * `nivel` só passa se for um dos dois valores que a tela entende. Um texto
   * qualquer viraria um botão que não existe no celular.
   */
  const detalhesRefeicao = new Map<string, { nivel?: string; troca?: string }>()
  for (const d of lista(diario?.campos.dieta_detalhes)) {
    const nome = txt(d.nome)
    if (!nome) continue
    const nivel = txt(d.nivel)
    detalhesRefeicao.set(nome, {
      nivel: nivel === 'metade' || nivel === 'pouco' ? nivel : undefined,
      troca: txt(d.troca).slice(0, 120) || undefined
    })
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
    // O detalhe do dia — quanto foi comido e o que entrou no lugar. Volta
    // para o celular para o painel abrir já com a resposta de antes, em vez
    // de a pessoa precisar lembrar o que respondeu de manhã.
    const detalheDoDia = detalhesRefeicao.get(nome)
    out.push({
      especie: 'refeicao',
      nome,
      detalhe: comValor({
        hora: txt(r.hora), itens: txt(r.itens), kcal: num(r.kcal), prot: num(r.prot),
        feito: feitosHoje.refeicao.has(nome) ? true : undefined,
        nivel: detalheDoDia?.nivel,
        troca: detalheDoDia?.troca
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
  /*
   * TODAS as anotações — e não só as de hoje.
   *
   * Antes o corte era aqui: só subia `date === hoje` ou sem data. Isso fazia
   * do celular uma janela para o dia, e a anotação de terça-feira sumia na
   * quarta mesmo continuando no vault. Agora sobem todas, e quem decide o
   * que mostrar é a TELA: o Hoje filtra pelo dia, a tela Notas mostra o
   * conjunto. Separar assim tira uma regra de produto de dentro do
   * publicador, que é o lugar onde ela era invisível.
   *
   * O que NÃO mudou é o corte de segurança: pasta protegida continua fora,
   * porque uma anotação em `Vida/Contas` fala do que está guardado lá e o
   * nome dela já entrega o assunto.
   *
   * Ordem: permanente primeiro, depois da mais nova para a mais velha. É
   * essa ordem que o teto embaixo corta — se um dia houver anotação demais,
   * o que se perde é a mais antiga, nunca a que fica.
   */
  const anotacoes = notas
    .filter(x => x.tipo === 'anotacao' && !emPastaProtegida(x.path))
    .sort((a, b) => {
      const da = txt(a.date)
      const db = txt(b.date)
      if (!da !== !db) return da ? 1 : -1
      if (da !== db) return db.localeCompare(da)
      return txt(a.title).localeCompare(txt(b.title))
    })
    /*
     * Teto de anotações publicadas.
     *
     * Hoje são três, e por muito tempo serão poucas. O teto existe porque
     * esta lista passou a crescer para sempre: sem ele, daqui a dois anos o
     * cardápio inteiro viaja a cada publicação e o celular baixa tudo por
     * causa de uma marcação de água.
     */
    .slice(0, 300)

  for (const n of anotacoes) {
    const data = txt(n.date)
    out.push({
      especie: 'anotacao',
      nome: txt(n.title),
      detalhe: comValor({
        path: n.path,
        // A data agora VIAJA: é com ela que a tela separa o recado de hoje
        // do de semana passada. Sem ela o celular receberia tudo junto e não
        // teria como voltar a mostrar só o dia.
        data: data || undefined,
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

  /*
   * O HISTÓRICO: medidas, cardio e transações.
   *
   * Estas três não são catálogo do dia — são o que já aconteceu. Sobem porque
   * o celular passou a mostrar evolução (o peso ao longo das semanas, o cardio
   * da semana, o gasto do mês) e até agora ele só sabia ENVIAR esses
   * registros, nunca recebê-los de volta.
   *
   * Todas com teto, e o teto não é detalhe: o cardápio inteiro viaja a cada
   * publicação, e o vault vai acumular anos de diário. Sem corte, o celular
   * baixaria dois anos de lançamento por causa de um gráfico de oito pontos.
   */

  /*
   * Medidas: as mais recentes primeiro, cortadas em doze.
   *
   * Doze porque o gráfico do celular mostra oito colunas e a tela de Corpo
   * compara com a medição anterior — doze dá folga para as duas coisas sem
   * virar histórico completo.
   */
  const medidas = notas
    .filter(x => x.tipo === 'medida' && txt(x.date) !== '')
    .sort((a, b) => txt(b.date).localeCompare(txt(a.date)))
    .slice(0, 12)

  for (const n of medidas) {
    out.push({
      especie: 'medida',
      // A data é o nome porque é a chave natural: uma medição por dia, e duas
      // no mesmo dia são a mesma medição corrigida.
      nome: txt(n.date),
      detalhe: comValor({
        data: txt(n.date),
        peso: num(n.campos.peso),
        gordura: num(n.campos.gordura),
        cintura: num(n.campos.cintura),
        quadril: num(n.campos.quadril),
        braco: num(n.campos.braco),
        coxa: num(n.campos.coxa),
        peito: num(n.campos.peito),
        panturrilha: num(n.campos.panturrilha)
      })
    })
  }

  /*
   * Cardio: as últimas vinte sessões.
   *
   * A tela mostra a semana, mas vinte cobre também quem treina pouco e ainda
   * quer ver as últimas sessões — cortar em sete deixaria a lista vazia na
   * segunda-feira de quem correu no fim de semana anterior.
   */
  const cardios = notas
    .filter(x => x.tipo === 'cardio' && txt(x.date) !== '')
    .sort((a, b) => txt(b.date).localeCompare(txt(a.date)))
    .slice(0, 20)

  for (const n of cardios) {
    out.push({
      especie: 'cardio',
      // Data mais aparelho: dois cardios no mesmo dia são comuns (correr de
      // manhã, bike à noite), e só a data os fundiria num item só.
      nome: `${txt(n.date)} ${txt(n.campos.aparelho) || 'cardio'}`.trim(),
      detalhe: comValor({
        data: txt(n.date),
        aparelho: txt(n.campos.aparelho),
        minutos: num(n.campos.minutos),
        distancia: num(n.campos.distancia),
        pace: txt(n.campos.pace)
      })
    })
  }

  /*
   * Os lançamentos do dia, um a um.
   *
   * Eles moram DENTRO do diário, e havia aqui uma regra de que o diário só
   * subia DOIS campos — com teste travando pelo nome ("NADA sensível do vault
   * aparece no que sobe"). A regra existia por privacidade: gasto é extrato.
   *
   * O dono levantou a restrição em 10/09/2026, com estas palavras: "os
   * lancamentos podem sim fica tranquilo". Os testes foram ajustados junto,
   * e não apagados — eles continuam travando senha, documento e anotação de
   * pasta protegida, que NÃO entraram no acordo. O que mudou foi só o
   * dinheiro.
   *
   * 45 dias, e não 30: quem abre o app no dia 1º quer ver o mês que fechou
   * ontem, e um corte de 30 dias o esvaziaria justo ali.
   */
  const limite = new Date(`${hoje}T00:00:00`)
  limite.setDate(limite.getDate() - 45)
  const desde = [
    limite.getFullYear(),
    String(limite.getMonth() + 1).padStart(2, '0'),
    String(limite.getDate()).padStart(2, '0')
  ].join('-')

  const transacoes: ItemCardapio[] = []
  for (const n of notas.filter(x => x.tipo === 'diario' && txt(x.date) >= desde)) {
    const data = txt(n.date)
    for (const [campo, sempreSaida] of [['transacoes', false], ['gastos', true]] as const) {
      for (const [i, l] of lista(n.campos[campo]).entries()) {
        const valor = num(l.valor)
        if (valor === undefined) continue
        transacoes.push({
          especie: 'transacao',
          // Data, campo e posição: é o que torna a chave única sem depender do
          // texto do item, que se repete todo dia ("Almoço").
          nome: `${data}#${campo}#${i}`,
          detalhe: comValor({
            data,
            item: txt(l.item),
            // Ao centavo: somar float acumula 0.30000000000000004, e esse
            // número chegaria à tela do celular do jeito que está.
            valor: Math.round(valor * 100) / 100,
            cat: txt(l.cat),
            // A lista antiga `gastos` nasceu antes de existir entrada, e todo
            // item dela é saída. Sem esta regra, um gasto de 2025 entraria
            // como receita na soma do celular.
            dir: sempreSaida ? 'saida' : (txt(l.dir) === 'entrada' ? 'entrada' : 'saida')
          })
        })
      }
    }
  }
  // Do mais novo para o mais velho, para o teto cortar o que menos importa.
  transacoes.sort((a, b) => txt(b.detalhe.data).localeCompare(txt(a.detalhe.data)))
  out.push(...transacoes.slice(0, 200))

  return out
}
