import type { Evento } from '../../shared/eventos'
import { txt, comValor } from './util'

/**
 * Traduz um evento vindo do celular nas mudanças que ele causa no vault.
 *
 * É puro de propósito: decidir "isto vira o quê" fica testável sem tocar em
 * disco, e o executor (`executar.ts`) fica fino demais para esconder defeito.
 */

export type Operacao =
  /** Acrescenta a um conjunto do diário (marcar suplemento, marcar refeição). */
  | { acao: 'diario-conjunto'; dia: string; campo: string; valor: string }
  /** Acrescenta a uma lista do diário (gasto, refeição extra). */
  | { acao: 'diario-lista'; dia: string; campo: string; item: Record<string, unknown> }
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
    case 'suplemento': {
      const nome = txt(dados.nome)
      if (!nome) return []
      return [{ acao: 'diario-conjunto', dia, campo: 'suplementos_feitos', valor: nome }]
    }

    case 'refeicao_plano': {
      const nome = txt(dados.nome)
      if (!nome) return []
      return [{ acao: 'diario-conjunto', dia, campo: 'dieta_feitas', valor: nome }]
    }

    case 'refeicao_extra':
      return [{ acao: 'diario-lista', dia, campo: 'extras', item: comValor(dados) }]

    case 'gasto':
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
      return [{
        acao: 'marcar', path,
        tiposPermitidos: ['prova', 'simulado'],
        campos: { estudado: true, estudado_em: dia }
      }]
    }

    case 'compromisso_cancelado': {
      const path = txt(dados.path)
      if (!path) return []
      // Marca, não apaga: um toque errado no ônibus não pode sumir com o
      // arquivo, e desfazer é destrabalhar um campo no computador.
      return [{
        acao: 'marcar', path,
        tiposPermitidos: ['evento'],
        campos: { cancelado: true, cancelado_em: dia }
      }]
    }

    case 'compromisso': {
      const titulo = txt(dados.titulo).trim()
      if (!titulo) return []
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
        frontmatter: { tipo: 'anotacao', date: dia, titulo, texto }
      }]
    }

    default:
      // Um app mais novo mandando um tipo que este Cortex não conhece não
      // pode derrubar a sincronização inteira. Ignora e segue.
      return []
  }
}
