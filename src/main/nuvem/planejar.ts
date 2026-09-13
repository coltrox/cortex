import type { Evento } from '../../shared/eventos'
import { txt, num, comValor } from './util'
import { anoDeOrigem } from '../../shared/datas'

/**
 * Traduz um evento vindo do celular nas mudanças que ele causa no vault.
 *
 * É puro de propósito: decidir "isto vira o quê" fica testável sem tocar em
 * disco, e o executor (`executar.ts`) fica fino demais para esconder defeito.
 */

export type Operacao =
  /** Acrescenta a um conjunto do diário (marcar suplemento, marcar refeição). */
  | { acao: 'diario-conjunto'; dia: string; campo: string; valor: string }
  /**
   * Soma a um número do diário (água bebida no dia).
   *
   * Soma, e não substitui: cada garrafa é um evento próprio, e dois celulares
   * — ou o mesmo depois de ficar sem sinal — mandariam totais diferentes se
   * cada um enviasse "o total é X". Somando, a ordem de chegada não importa e
   * nada se perde.
   *
   * `quanto` negativo desfaz. O executor não deixa o total ficar abaixo de
   * zero: um desfazer a mais é dedo torto, não uma dívida de água.
   */
  | { acao: 'diario-somar'; dia: string; campo: string; quanto: number }
  /**
   * Tira de um conjunto do diário — o desfazer do check.
   *
   * Operação separada, e não um `diario-conjunto` com um sinal dentro: quem
   * lê `executar.ts` vê pelo nome se aquela linha põe ou tira, e um booleano
   * escondido no meio dos campos seria a única diferença entre acrescentar e
   * apagar dado do diário.
   */
  | { acao: 'diario-tirar'; dia: string; campo: string; valor: string }
  /** Acrescenta a uma lista do diário (gasto, refeição extra). */
  | { acao: 'diario-lista'; dia: string; campo: string; item: Record<string, unknown> }
  /**
   * Põe (ou substitui) UM item de uma lista do diário, achado pela chave.
   *
   * Diferente de `diario-lista`, que sempre acrescenta. Existe porque o
   * detalhe de uma refeição é uma resposta, não um histórico: dizer "comi
   * metade" e depois corrigir para "comi tudo" tem que deixar uma linha no
   * diário, não duas se contradizendo. `item: null` tira a entrada — é o que
   * acontece ao desmarcar a refeição.
   */
  | {
      acao: 'diario-item'; dia: string; campo: string
      chave: string; valor: string; item: Record<string, unknown> | null
    }
  /**
   * Edita ou apaga UM lançamento do diário, achado pela posição na lista.
   *
   * Posição porque lançamento não tem id — é a mesma chave que o cardápio
   * publica (`data#campo#posição`). `antes` é o que o celular via: o executor
   * só mexe se a linha ainda for aquela, porque um lançamento acrescentado ou
   * apagado no meio desloca as posições. `item: null` apaga.
   */
  | {
      acao: 'diario-transacao'; dia: string; campo: 'transacoes' | 'gastos'; indice: number
      antes: { item: string; valor: number }; item: Record<string, unknown> | null
    }
  /**
   * Cria uma nota nova. `seExistir` decide o que fazer quando `path` já
   * existe: `'mesclar'` funde o frontmatter novo por cima do que já está lá
   * (dois cardios no mesmo dia devem virar um registro só); `'criarOutro'`
   * nunca mescla — o executor acrescenta um sufixo ao nome e cria um arquivo
   * à parte (duas anotações que só por acaso começam com a mesma frase não
   * podem apagar uma à outra).
   */
  | {
      acao: 'nota'; tipo: string; path: string; frontmatter: Record<string, unknown>
      seExistir: 'mesclar' | 'criarOutro'
    }
  /** Cria a nota se faltar e mescla campos — usado por peso e medida. */
  | { acao: 'nota-campos'; tipo: string; path: string; campos: Record<string, unknown> }
  /**
   * Marca campos numa nota que JÁ existe — "estudei esta prova", "cancelei
   * este compromisso".
   *
   * `tiposPermitidos` é a guarda que separa esta operação das outras: o
   * caminho vem de fora, do celular, e sem ela um evento poderia escrever
   * `cancelado: true` em qualquer nota do vault — inclusive numa que não
   * tem nada a ver com agenda. O executor confere o `tipo` da nota no disco
   * antes de tocar nela, e ignora quando não bate.
   *
   * Nunca cria: se a nota sumiu, a operação não faz nada. Criar aqui
   * ressuscitaria, como nota vazia, algo que o dono apagou no computador.
   */
  | {
      acao: 'marcar'; path: string
      tiposPermitidos: string[]; campos: Record<string, unknown>
    }
  /**
   * Apaga a nota do vault. Sem desfazer.
   *
   * Tem a MESMA guarda de tipo do `marcar`, e ela importa mais aqui: sem
   * ela, um evento apagaria qualquer arquivo do vault — um documento, uma
   * senha, um projeto inteiro. O executor confere o tipo antes de remover, e
   * ignora quando não bate.
   */
  | { acao: 'apagar'; path: string; tiposPermitidos: string[] }

/**
 * Os dias da semana, no vocabulário do Cortex.
 *
 * Sem acento em `sab`, e exatamente estes sete: é o que os formulários da
 * interface gravam, e um `sáb` com acento vindo de fora faria o suplemento de
 * sábado nunca mais aparecer — a comparação é por texto.
 */
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

/**
 * A lista de dias que veio de fora, filtrada.
 *
 * `undefined` quando não veio nada, para `comValor` tirar o campo em vez de
 * gravar uma lista vazia — que apagaria os dias em vez de deixá-los como
 * estavam. Lista vazia DE PROPÓSITO não existe aqui: "todo dia" se diz não
 * mandando o campo.
 */
function diasDaSemana(bruto: unknown): string[] | undefined {
  if (!Array.isArray(bruto)) return undefined
  const dias = [...new Set(bruto.map(d => txt(d).trim().toLowerCase()))]
    .filter(d => DIAS_SEMANA.includes(d))
  return dias.length > 0 ? DIAS_SEMANA.filter(d => dias.includes(d)) : undefined
}

/** Higieniza um título para virar nome de arquivo, igual ao renderer faz. */
const nomeArquivo = (s: string): string =>
  s.replace(/[/:*?"<>|\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)

// `txt`/`comValor` vêm de `./util` — mesma guarda endurecida usada por
// `cardapio.ts`: só escalar vira texto, porque `String(v)` de um array junta
// os elementos com vírgula e deixaria um array escapar sem ninguém perceber
// (ver comentário em `util.ts`). `dados` aqui é `Record<string, unknown>`
// vindo do banco, tão hostil quanto o frontmatter que `cardapio.ts` lê.

export function planejar(evento: Evento): Operacao[] {
  const { tipo, dia, dados } = evento

  switch (tipo) {
    /*
     * Marcar e desmarcar são o mesmo evento, com o sinal trocado.
     *
     * `feito: false` desfaz. Vai dentro do mesmo tipo, e não num tipo novo,
     * porque um tipo novo precisaria entrar em `TIPOS_EVENTO`, aqui e na
     * lista `tipos_validos()` do banco — e a última exige rodar o SQL do
     * Supabase de novo, para o evento fazer exatamente a mesma coisa ao
     * contrário.
     *
     * Ausente vale como "marcou": é como o app do celular mandava antes, e um
     * evento parado na fila desde então não pode virar uma desmarcação ao ser
     * aplicado dias depois.
     */
    case 'suplemento': {
      const nome = txt(dados.nome)
      if (!nome) return []
      const acao = dados.feito === false ? 'diario-tirar' : 'diario-conjunto'
      return [{ acao, dia, campo: 'suplementos_feitos', valor: nome }]
    }

    /*
     * A refeição do plano — e, desde 1.2.0, quanto dela foi comido.
     *
     * Duas operações, e não uma. `dieta_feitas` continua sendo o conjunto de
     * nomes: é o que a lente Saúde conta e o que o celular usa para desenhar
     * o check, e mudar o formato dele quebraria os dois para todo dia já
     * gravado. O detalhe vai em `dieta_detalhes`, uma lista à parte, e só
     * existe quando há algo a dizer.
     *
     * "Comi tudo" não gera detalhe nenhum: é o caso normal, e uma linha por
     * refeição dizendo `nivel: tudo` encheria o diário de ruído para repetir
     * o que o check já disse.
     */
    case 'refeicao_plano': {
      const nome = txt(dados.nome)
      if (!nome) return []
      const desmarcou = dados.feito === false
      const ops: Operacao[] = [{
        acao: desmarcou ? 'diario-tirar' : 'diario-conjunto',
        dia, campo: 'dieta_feitas', valor: nome
      }]

      // Só os dois níveis que dizem algo. Qualquer outro texto vindo do banco
      // é descartado, e não escrito no vault: `dados` é registro livre.
      const nivelBruto = txt(dados.nivel)
      const nivel = nivelBruto === 'metade' || nivelBruto === 'pouco' ? nivelBruto : undefined
      const troca = txt(dados.troca).slice(0, 120)

      if (desmarcou || (!nivel && !troca)) {
        ops.push({ acao: 'diario-item', dia, campo: 'dieta_detalhes', chave: 'nome', valor: nome, item: null })
      } else {
        ops.push({
          acao: 'diario-item', dia, campo: 'dieta_detalhes', chave: 'nome', valor: nome,
          item: comValor({ nome, nivel, troca })
        })
      }
      return ops
    }

    /*
     * A tarefa diária, marcada e desmarcada como o suplemento.
     *
     * Conjunto próprio (`rotinas_feitas`), e não o dos suplementos: a lente
     * Saúde conta `suplementos_feitos` para dizer quantos foram tomados no
     * dia, e "escovar os dentes" entrando ali estragaria essa conta.
     */
    case 'rotina_feita': {
      const nome = txt(dados.nome)
      if (!nome) return []
      const acao = dados.feito === false ? 'diario-tirar' : 'diario-conjunto'
      return [{ acao, dia, campo: 'rotinas_feitas', valor: nome }]
    }

    /*
     * Água bebida, em ml.
     *
     * Um teto de 5 litros por evento não é frescura: `dados` vem do banco
     * como registro livre, e um número absurdo (ou vindo de um app com
     * defeito) contaminaria o total do dia sem ninguém notar. Cinco litros
     * de uma vez já é mais do que qualquer garrafa.
     */
    case 'agua': {
      const ml = num(dados.ml)
      if (ml === undefined || ml === 0) return []
      if (Math.abs(ml) > 5000) return []
      return [{ acao: 'diario-somar', dia, campo: 'agua_ml', quanto: Math.round(ml) }]
    }

    case 'refeicao_extra':
      return [{ acao: 'diario-lista', dia, campo: 'extras', item: comValor(dados) }]

    /*
     * A sessão de estudo.
     *
     * Linha no diário, e não nota própria: estudar duas vezes no mesmo dia é
     * o caso normal, e uma nota por dia faria a segunda sessão apagar a
     * primeira. A soma da lista é a hora estudada do dia.
     *
     * Aqui NÃO se espalha `dados`, ao contrário do gasto e da refeição
     * extra: os campos são copiados um a um. É a mesma regra do cardápio,
     * pelo mesmo motivo — este item vai para o frontmatter do diário, e um
     * evento vindo de fora não escolhe o que entra num arquivo do vault.
     */
    case 'estudo': {
      const materia = txt(dados.materia)
      const minutos = num(dados.minutos)
      if (!materia) return []
      // Sem minutos não há o que somar, e uma sessão de doze horas seguidas
      // é app com defeito, não estudo. Descartar é melhor do que contaminar
      // o total da semana com um número que ninguém vai conferir.
      if (minutos === undefined || minutos <= 0 || minutos > 720) return []

      const questoes = num(dados.questoes)
      const acertos = num(dados.acertos)
      const feitas = questoes !== undefined && questoes >= 0 ? Math.round(questoes) : undefined
      return [{
        acao: 'diario-lista', dia, campo: 'estudos',
        item: comValor({
          materia,
          minutos: Math.round(minutos),
          questoes: feitas,
          // Acertar mais do que se resolveu não existe. Limitar em vez de
          // descartar: quem digitou 10 de 8 errou o campo, não a sessão.
          acertos: acertos !== undefined && acertos >= 0
            ? (feitas !== undefined ? Math.min(Math.round(acertos), feitas) : Math.round(acertos))
            : undefined,
          obs: txt(dados.obs) || undefined
        })
      }]
    }

    case 'gasto':
      /*
       * Editar ou excluir um lançamento que já existe.
       *
       * Chega como `gasto` com um `alvo` (a chave `data#campo#posição` que o
       * cardápio publica), para não criar tipo de evento novo no banco. Campo a
       * campo, sem espalhar `dados`: é uma linha de dinheiro no diário.
       */
      if (txt(dados.alvo)) {
        const m = /^(\d{4}-\d{2}-\d{2})#(transacoes|gastos)#(\d+)$/.exec(txt(dados.alvo))
        const antes = dados.antes && typeof dados.antes === 'object' && !Array.isArray(dados.antes)
          ? dados.antes as Record<string, unknown>
          : {}
        const valorAntes = num(antes.valor)
        if (!m || valorAntes === undefined) return []
        const campo: 'transacoes' | 'gastos' = m[2] === 'gastos' ? 'gastos' : 'transacoes'
        const base = {
          acao: 'diario-transacao' as const, dia: m[1], campo, indice: Number(m[3]),
          antes: { item: txt(antes.item), valor: valorAntes }
        }
        if (dados.apagar === true) return [{ ...base, item: null }]
        const item = txt(dados.item).trim()
        const valor = num(dados.valor)
        if (!item || valor === undefined || valor <= 0) return []
        return [{
          ...base,
          item: comValor({
            item, valor,
            cat: txt(dados.cat).trim() || undefined,
            dir: txt(dados.dir) === 'entrada' ? 'entrada' : 'saida'
          })
        }]
      }
      // Só a string exata 'entrada' produz entrada; qualquer outra coisa
      // (ausente, com caixa diferente, lixo qualquer) vira saída — entre
      // errar o saldo do mês para mais ou para menos, menos é o lado seguro.
      // `dir` é escrito por último de propósito: espalhar `dados` primeiro e
      // sobrescrever `dir` depois é a única ordem em que ler a linha já diz
      // quem ganha — sobrescrever cedo deixaria um `dados.dir` cru vencer.
      return [{
        acao: 'diario-lista', dia, campo: 'transacoes',
        item: comValor({ ...dados, dir: txt(dados.dir) === 'entrada' ? 'entrada' : 'saida' })
      }]

    case 'sessao': {
      const modelo = txt(dados.modelo) || 'Treino livre'
      // tipo/date depois do spread, mesmo motivo do `cardio` — só `modelo`
      // estava protegido aqui antes; `tipo`/`date` tinham o mesmo furo.
      return [{
        acao: 'nota', tipo: 'sessao', seExistir: 'mesclar',
        path: `Saude/Treinos/${nomeArquivo(`${modelo} — ${dia}`)}.md`,
        frontmatter: comValor({ ...dados, tipo: 'sessao', date: dia, modelo })
      }]
    }

    case 'cardio':
      // tipo/date são escritos depois do spread de propósito: `dados` é
      // Record<string, unknown> livre, vindo de um evento externo, e `tipo`
      // decide o que a nota É para o app inteiro — um evento não pode
      // escolher isso espalhando `dados.tipo`/`dados.date` por cima.
      return [{
        acao: 'nota', tipo: 'cardio', seExistir: 'mesclar',
        path: `Saude/Treinos/cardio-${dia}.md`,
        frontmatter: comValor({ ...dados, tipo: 'cardio', date: dia })
      }]

    // Peso e medida escrevem na mesma nota de propósito: o botão de peso é um
    // atalho, não um dado paralelo, e o gráfico de peso lê um lugar só.
    // tipo/date depois do spread pelo mesmo motivo do caso `cardio` acima.
    case 'peso':
    case 'medida':
      return [{
        acao: 'nota-campos', tipo: 'medida',
        path: `Saude/medida-${dia}.md`,
        campos: comValor({ ...dados, tipo: 'medida', date: dia })
      }]

    /*
     * Os três da agenda e dos estudos.
     *
     * Os dois de marcar recebem o `path` que o próprio Cortex publicou no
     * cardápio, e não o título: dois compromissos chamados "Dentista" em
     * semanas diferentes têm títulos iguais e caminhos diferentes, e casar
     * por título cancelaria o errado.
     */
    case 'prova_estudada': {
      const path = txt(dados.path)
      if (!path) return []
      // Ausente quer dizer "marcou": é como o app mandava antes, e um evento
      // desses parado na fila do celular desde antes não pode virar uma
      // desmarcação ao ser aplicado.
      const estudado = dados.estudado !== false
      return [{
        acao: 'marcar', path,
        tiposPermitidos: ['prova', 'simulado'],
        // `null` apaga a chave do frontmatter (ver `patchFrontmatter`), e é o
        // que se quer aqui: desmarcar devolve a nota ao estado de quem nunca
        // estudou, em vez de deixar `estudado: false` e uma data de quando
        // não estudou — que não quer dizer nada.
        campos: estudado
          ? { estudado: true, estudado_em: dia }
          : { estudado: null, estudado_em: null }
      }]
    }

    /*
     * A inscrição e o pagamento do vestibular.
     *
     * Duas etapas, uma de cada vez, e a ordem importa: não há como pagar uma
     * inscrição que não foi feita. Quem cuida de mostrar a etapa certa é a
     * tela; aqui só se grava o que ela mandou.
     *
     * Guarda a data de cada uma (`inscrito_em`, `pago_em`) porque prazo de
     * vestibular se discute depois — "paguei dia 12" é o que resolve uma
     * dúvida com a banca, e o dia em que se apertou o botão é a única fonte
     * disso que existe.
     */
    case 'prova_etapa': {
      const path = txt(dados.path)
      const etapa = txt(dados.etapa)
      if (!path || (etapa !== 'inscrito' && etapa !== 'pago')) return []
      // Ausente quer dizer "marcou", como em `prova_estudada`: um evento
      // parado na fila desde antes não pode virar uma desmarcação.
      const feito = dados.feito !== false
      return [{
        acao: 'marcar', path,
        tiposPermitidos: ['prova', 'simulado'],
        // `null` apaga a chave, devolvendo a nota ao estado de quem nunca fez
        // a etapa — em vez de deixar `inscrito: false` e uma data de quando
        // não se inscreveu, que não quer dizer nada.
        campos: feito
          ? { [etapa]: true, [`${etapa}_em`]: dia }
          : { [etapa]: null, [`${etapa}_em`]: null }
      }]
    }

    case 'item_apagado': {
      const path = txt(dados.path)
      if (!path) return []
      // Apaga de verdade, e não marca: foi o que o dono pediu. O que segura
      // um toque errado é a confirmação na tela do celular, não uma marca
      // aqui — e a lista de tipos abaixo é o que impede este evento de
      // alcançar uma nota que não seja de agenda ou de estudos.
      return [{
        acao: 'apagar', path,
        // `anotacao` entrou em 11/09/2026: a nota escrita no celular passou a
        // poder ser apagada de lá também. Continua sendo uma lista curta de
        // tipos que o próprio celular cria — este evento nunca alcança conta,
        // documento, projeto ou diário.
        // `data-comemorativa` entrou em 13/09/2026: ela é criada pelo celular
        // desde a 1.9, e o excluir de lá era descartado aqui em silêncio.
        tiposPermitidos: ['evento', 'prova', 'simulado', 'tarefa', 'anotacao', 'data-comemorativa']
      }]
    }

    /*
     * Edita um item da agenda ou dos estudos.
     *
     * O nome do tipo diz "compromisso" por história: ele nasceu quando só
     * compromisso era editável, e mudá-lo agora obrigaria a rodar o SQL do
     * Supabase de novo (`tipos_validos()`) para não ganhar nada — o evento faz
     * exatamente a mesma coisa, só que também em prova, simulado e tarefa.
     *
     * A lista de tipos é a MESMA de `item_apagado`, e não uma lista mais
     * frouxa: são os quatro que o celular já pode criar e apagar. Poder editar
     * um deles não alcança nada que apagar já não alcançasse.
     */
    case 'compromisso_editado': {
      const path = txt(dados.path)
      if (!path) return []

      /*
       * Editar uma data comemorativa.
       *
       * A nota dela não tem `date`: tem DIA, MÊS e o ano de quando começou.
       * Pelo caminho comum abaixo, a edição escreveria `date` numa nota que
       * não lê esse campo — e nem chegaria a escrever, porque
       * `data-comemorativa` não está na lista de tipos que ele alcança. Era o
       * botão de editar que não fazia nada.
       *
       * Só alcança `data-comemorativa`: a marca não pode servir para mexer em
       * dia e mês de outra espécie de nota.
       */
      if (dados.comemorativa === true) {
        const [ano, mes, diaDoMes] = txt(dados.data).split('-').map(Number)
        const dataValida = Number.isInteger(mes) && mes >= 1 && mes <= 12
          && Number.isInteger(diaDoMes) && diaDoMes >= 1 && diaDoMes <= 31
        const campos = comValor({
          title: txt(dados.titulo).trim(),
          // Dia e mês andam juntos: um sem o outro seria outra data.
          dia: dataValida ? diaDoMes : undefined,
          mes: dataValida ? mes : undefined,
          ano: dataValida ? anoDeOrigem(ano, dia) : undefined
        })
        if (Object.keys(campos).length === 0) return []
        return [{ acao: 'marcar', path, tiposPermitidos: ['data-comemorativa'], campos }]
      }
      // Só os campos que a tela do celular sabe editar, um a um. Um spread de
      // `dados` aqui deixaria um evento reescrever `tipo` e virar outra coisa.
      const campos = comValor({
        title: txt(dados.titulo).trim(),
        date: txt(dados.data).trim(),
        hora: txt(dados.hora).trim(),
        local: txt(dados.local).trim(),
        materia: txt(dados.materia).trim(),
        // A anotação guarda o que foi escrito em DOIS lugares: `title`, que é
        // o nome do arquivo na lista, e `texto`, que é o conteúdo. Editar só
        // um deixaria a nota dizendo duas coisas diferentes sobre si mesma.
        // As outras telas não mandam este campo, e aí ele não entra.
        texto: txt(dados.texto).trim(),
        /*
         * E `titulo` também, quando é anotação (a única que manda `texto`).
         *
         * A anotação criada no celular guarda o nome em `titulo`, e o índice
         * lê `titulo` ANTES de `title`. Editar só `title` deixava o Cortex e o
         * celular mostrando o texto antigo para sempre. Achado no teste de
         * ponta a ponta de 13/09/2026.
         */
        titulo: txt(dados.texto).trim() ? txt(dados.titulo).trim() : undefined,
        /*
         * O que o suplemento e a tarefa diária têm de seu.
         *
         * `dose` é a quantidade ("30 g"), `quando` é o momento ("pós-treino"),
         * e `dias` é em que dias da semana aquilo entra. Antes só davam para
         * mexer no computador — e trocar a dose de um suplemento é o tipo de
         * coisa que se decide na hora de tomar, com o pote na mão.
         */
        dose: txt(dados.dose).trim(),
        quando: txt(dados.quando).trim(),
        // Item a item, e só os sete dias que o Cortex conhece: um objeto
        // disfarçado de dia não entra no frontmatter do vault.
        dias: diasDaSemana(dados.dias)
      })
      if (Object.keys(campos).length === 0) return []
      return [{
        acao: 'marcar', path,
        tiposPermitidos: [
          'evento', 'prova', 'simulado', 'tarefa', 'anotacao',
          // Os dois que o celular marca todo dia, e agora também corrige.
          'suplemento', 'rotina'
        ],
        campos
      }]
    }

    case 'compromisso': {
      const titulo = txt(dados.titulo).trim()
      if (!titulo) return []

      /*
       * Data comemorativa: o mesmo evento, com uma marca.
       *
       * Aniversário não é compromisso — ele se repete todo ano, e por isso a
       * nota guarda DIA e MÊS em vez de uma data. O ano, quando vem, é quando
       * aquilo começou, e é dele que sai "faz 18 anos".
       *
       * Vai dentro de `compromisso` em vez de virar um tipo de evento próprio
       * porque um tipo novo teria de entrar em `tipos_validos()`, no banco, e
       * isso obrigaria a rodar o SQL do Supabase de novo. A marca é um
       * booleano fechado, escolhido pela tela entre duas opções — bem
       * diferente de deixar um evento de fora escrever `tipo` e decidir
       * sozinho o que a nota É, que é o furo que este arquivo evita.
       */
      if (dados.comemorativa === true) {
        const data = txt(dados.data)
        const [ano, mes, diaDoMes] = data.split('-').map(Number)
        if (!Number.isInteger(mes) || !Number.isInteger(diaDoMes)) return []
        return [{
          acao: 'nota', tipo: 'data-comemorativa', seExistir: 'mesclar',
          path: `Agenda/${nomeArquivo(titulo)}.md`,
          frontmatter: comValor({
            tipo: 'data-comemorativa', title: titulo,
            dia: diaDoMes, mes,
            // O ano só entra quando é plausível: o campo do celular é uma
            // data inteira, e quem não sabe o ano de nascimento põe o
            // corrente — o que faria a tela anunciar "faz 0 anos".
            ano: anoDeOrigem(ano, dia),
            oque: txt(dados.oque).trim() || undefined
          })
        }]
      }
      // A data do compromisso é a que veio, não a de hoje: marcar no celular
      // um dentista de semana que vem tem de cair na semana que vem.
      const data = txt(dados.data) || dia
      // 'criarOutro': dois compromissos de mesmo nome em datas diferentes são
      // dois compromissos. Mesclar apagaria a data do primeiro.
      return [{
        acao: 'nota', tipo: 'evento', seExistir: 'criarOutro',
        path: `Agenda/${nomeArquivo(titulo)}.md`,
        frontmatter: comValor({
          ...dados,
          // tipo/title/date depois do spread pelo mesmo motivo do caso
          // `cardio`: um evento externo não escolhe o que a nota É.
          tipo: 'evento', title: titulo, date: data,
          // `path` e `titulo` são de transporte, não campos da nota.
          path: undefined, titulo: undefined, data: undefined
        })
      }]
    }

    /*
     * Prova e tarefa novas.
     *
     * Mesma forma do `compromisso`, com a pasta e o tipo de cada uma. Nao ha
     * um caso generico com o tipo vindo do evento, de proposito: `tipo` decide
     * o que a nota E para o app inteiro, e deixar um evento escolher isso e o
     * furo que este arquivo evita em todos os outros casos.
     */
    case 'prova_nova':
    case 'tarefa_nova': {
      const titulo = txt(dados.titulo).trim()
      if (!titulo) return []
      const prova = tipo === 'prova_nova'
      return [{
        acao: 'nota', tipo: prova ? 'prova' : 'tarefa', seExistir: 'criarOutro',
        path: `${prova ? 'Estudos/Provas' : 'Estudos'}/${nomeArquivo(titulo)}.md`,
        frontmatter: comValor({
          ...dados,
          tipo: prova ? 'prova' : 'tarefa',
          title: titulo,
          date: txt(dados.data) || dia,
          titulo: undefined, data: undefined, path: undefined
        })
      }]
    }

    case 'porquinho': {
      const titulo = txt(dados.titulo).trim() || 'Movimento do porquinho'
      const valor = Number(dados.valor)
      if (!Number.isFinite(valor) || valor <= 0) return []
      // Só dois movimentos existem, e o vocabulário é o do Cortex: qualquer
      // outra coisa vira depósito, que é o caso seguro — um depósito a mais
      // por engano se conserta somando; uma sangria a mais mente sobre
      // dinheiro que existe.
      const direcao = txt(dados.direcao) === 'sangria' ? 'sangria' : 'deposito'
      return [{
        acao: 'nota', tipo: 'porquinho', seExistir: 'criarOutro',
        path: `Grana/${nomeArquivo(titulo)} ${dia}.md`,
        frontmatter: comValor({
          ...dados,
          // tipo/title/date/direcao depois do spread pelo mesmo motivo do
          // caso `cardio`: um evento externo não escolhe o que a nota É.
          tipo: 'porquinho', title: titulo, date: dia, valor, direcao,
          titulo: undefined
        })
      }]
    }

    case 'anotacao': {
      const texto = txt(dados.texto).trim()
      if (!texto) return []
      const titulo = texto.split(/\r\n|\n/)[0].slice(0, 60)
      // 'criarOutro': o caminho vem só da primeira linha do texto, então duas
      // anotações de dias diferentes que começam igual não podem cair no
      // mesmo arquivo e mesclar — mesclar aqui apagaria o texto de uma
      // anotação inteira sem aviso nenhum para o usuário.
      return [{
        acao: 'nota', tipo: 'anotacao', seExistir: 'criarOutro',
        path: `Vida/${nomeArquivo(titulo)}.md`,
        // `prioridade` só entra quando é verdadeira — `comValor` tira o
        // `undefined`. Uma anotação comum não carrega `prioridade: false`
        // no frontmatter: é uma linha que ninguém lê em toda nota do vault.
        frontmatter: comValor({
          tipo: 'anotacao', date: dia, titulo, texto,
          prioridade: dados.prioridade === true ? true : undefined
        })
      }]
    }

    default:
      // Um app mais novo mandando um tipo que este Cortex não conhece não
      // pode derrubar a sincronização inteira. Ignora e segue.
      return []
  }
}
