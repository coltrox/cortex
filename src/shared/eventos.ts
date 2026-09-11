import { z } from 'zod'

/**
 * O contrato entre o celular e o Cortex.
 *
 * Vive em `shared/` porque os dois lados dependem dele: mudar um campo aqui
 * quebra a compilação do desktop E do app web, que é exatamente o que se quer
 * — a alternativa é os dois divergirem em silêncio e o dado chegar torto.
 */

export const TIPOS_EVENTO = [
  'suplemento', 'refeicao_plano', 'refeicao_extra', 'gasto',
  'sessao', 'cardio', 'medida', 'peso', 'anotacao',
  // Agenda e estudos: os três que mexem numa nota que já existe, ou criam
  // uma. Os de cima só acrescentam ao diário do dia.
  'prova_estudada', 'compromisso', 'item_apagado', 'compromisso_editado',
  // Marcar do celular o que antes so nascia no Cortex.
  'prova_nova', 'tarefa_nova',
  // As etapas de quem presta vestibular: inscricao e pagamento.
  //
  // Tipo proprio, e nao mais um `prova_estudada` com outro campo, porque a
  // pergunta e outra. "Estudei" e sobre preparo e se repete; a inscricao
  // acontece uma vez, tem prazo proprio, e perder esse prazo tira a pessoa da
  // prova -- e a unica das duas cuja falha nao da para recuperar estudando
  // mais.
  'prova_etapa',
  // Porquinho: guardar e tirar. Movimento, nao saldo -- o saldo e a soma dos
  // movimentos, e quem faz essa conta e o Cortex.
  'porquinho',
  // A tarefa diaria: marcar e desmarcar, como o suplemento. Tipo proprio, e
  // nao um `suplemento` com uma etiqueta, porque ela cai num conjunto proprio
  // do diario (`rotinas_feitas`) -- misturar as duas faria a lente Saude
  // contar "escovar os dentes" como suplemento tomado.
  'rotina_feita',
  // Agua bebida, em ml. Nao e um check: cada garrafa SOMA ao total do dia, e
  // um `ml` negativo desfaz o gole registrado sem querer. Por isso tem tipo
  // proprio em vez de virar mais uma `rotina`.
  'agua',
  // A sessao de estudo: materia, minutos e, quando houve, questoes e acertos.
  //
  // Vira LINHA no diario do dia, e nao nota propria: estudar duas vezes no
  // mesmo dia e o caso normal, e uma nota por dia faria a segunda sessao
  // sobrescrever a primeira. Da lista sai a conta de horas por dia e por
  // semana -- o dado que nao existia, e sem o qual todo grafico de estudo
  // seria um grafico de zero.
  'estudo'
] as const

export type TipoEvento = (typeof TIPOS_EVENTO)[number]

/** Data no fuso local, nunca `toISOString()` (que vira o dia seguinte à noite). */
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dia deve ser ISO YYYY-MM-DD')

export const EVENTO_SCHEMA = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  dia: DIA,
  dados: z.record(z.string().max(64), z.unknown())
}).strict()

export type Evento = z.infer<typeof EVENTO_SCHEMA>

/**
 * As espécies que o Cortex publica.
 *
 * `treino`, `suplemento` e `refeicao` são catálogo: o que existe, nunca o
 * que foi feito. `prova`, `compromisso` e `tarefa` são o que está chegando
 * — o celular precisa vê-los para poder marcar, cancelar ou dizer que
 * estudou.
 *
 * Nada de Vida entra aqui. Documentos, senhas e contas ficam no computador,
 * e `cardapio.test.ts` falha se algum deles aparecer no que sobe.
 */
/**
 * Os tipos de NOTA que alimentam o cardápio.
 *
 * Diferente de `ESPECIES_CARDAPIO`, que é o que sai publicado: aqui é o que o
 * Cortex lê do vault para montar aquilo. Mora no contrato compartilhado
 * porque três lugares precisam concordar, e já divergiram uma vez —
 * `App.tsx` observava só três destes tipos, e o resultado era que criar uma
 * prova ou um compromisso no Cortex não republicava nada: o celular só via a
 * novidade quando, por acaso, um treino fosse editado depois.
 */
export const TIPOS_NOTA_CARDAPIO = [
  'treino-modelo', 'suplemento', 'plano', 'prova', 'simulado', 'evento', 'tarefa',
  // Aniversario e afins. Sobem como espécie 'compromisso', na próxima vez
  // que caem -- ver montarCardapio.
  'data-comemorativa',
  // Os dois do porquinho: os movimentos, para somar o saldo, e a meta ativa.
  'porquinho', 'meta-cofre',
  // A tarefa diária, que aparece no celular junto com os suplementos.
  'rotina',
  // A meta de água do dia e o tamanho da garrafa. O TOTAL bebido não vem
  // daqui: vem do diário, como todo registro do dia.
  'hidratacao',
  // A anotação rápida — a que o celular acabou de criar, voltando para ele.
  // Só as de HOJE sobem; ver `montarCardapio`, que é quem corta.
  'anotacao',
  // O diário do dia, e SÓ para saber o que já foi marcado hoje: sem ele o
  // celular não teria como saber que um suplemento foi desmarcado aqui no
  // Cortex, porque o check dele vivia apenas na memória do próprio aparelho.
  // `montarCardapio` copia dele quatro campos, nada mais — os três conjuntos
  // de check e o total de água. Ver a lista branca lá, que é o que impede o
  // resto do diário (gastos, peso, anotações do dia) de subir junto.
  'diario'
] as const

export const ESPECIES_CARDAPIO = [
  'treino', 'suplemento', 'refeicao', 'prova', 'compromisso', 'tarefa', 'porquinho',
  // A tarefa diária. Espécie própria, e não `tarefa` com uma etiqueta: a
  // `tarefa` tem prazo e vive na aba Chegando; esta se repete todo dia e vive
  // no Hoje, ao lado dos suplementos. Duas coisas diferentes com o mesmo nome
  // acabariam numa tela mostrando a outra.
  'rotina',
  // A água do dia: quanto já foi, qual é a meta, e de quanto é a garrafa.
  'hidratacao',
  // A anotação. Não é item de catálogo como as outras espécies: é registro, e
  // vai para o celular para ele conseguir MOSTRAR de volta o que foi
  // escrito. Sobem TODAS; quem corta pelo dia é a tela.
  'anotacao',
  /*
   * Uma área ligada no Cortex — `saude`, `conhecimento`, `financas`…
   *
   * Não é conteúdo: é o mapa do que o dono escolheu usar. O celular espelha
   * a escolha feita no computador, e uma área desligada não aparece por lá —
   * nem a tela, nem o atalho, nem a seção no Hoje.
   *
   * Vai como um item por área, e não uma lista dentro de um item, porque o
   * cardápio é uma tabela com chave (especie, nome) no banco: uma lista
   * dentro de `detalhe` seria um campo que o banco não sabe indexar nem
   * deduplicar, e a espécie inteira viraria uma linha só que se sobrescreve.
   *
   * NENHUM item desta espécie quer dizer "não sei" — Cortex antigo, ou SQL
   * ainda não rodado —, e aí o celular mostra tudo. Ausência não pode
   * significar "desligue tudo": isso apagaria o app inteiro de quem só
   * esqueceu de atualizar.
   */
  'area',

  /*
   * O HISTÓRICO, para o celular desenhar evolução em vez de só registrar.
   *
   * As três espécies abaixo são diferentes de todas as de cima: elas não são
   * o catálogo do que fazer hoje, são o que JÁ aconteceu. Entraram porque o
   * celular passou a ter telas que mostram evolução — o peso ao longo das
   * semanas, o cardio da semana, o gasto do mês — e até então ele só sabia
   * ENVIAR esses registros, nunca recebê-los de volta.
   *
   * Vão limitadas no publicador (ver `montarCardapio`): o cardápio inteiro
   * viaja a cada publicação, e mandar dois anos de diário por causa de um
   * gráfico de oito pontos seria pagar o histórico todo em toda sincronia.
   */

  /** Peso e medidas de uma data. Um item por nota `medida`. */
  'medida',
  /** Uma sessão de cardio: aparelho, minutos, distância. */
  'cardio',
  /** Uma transação do diário: item, valor, categoria, entrada ou saída. */
  'transacao'
] as const

export type EspecieCardapio = (typeof ESPECIES_CARDAPIO)[number]

/** Um item do cardápio. `detalhe.path` é como o celular devolve a referência. */
export type ItemCardapio = {
  especie: EspecieCardapio
  nome: string
  detalhe: Record<string, unknown>
}

const LIMITE_DADOS = 8 * 1024

export function validarEvento(bruto: unknown): Evento {
  const r = EVENTO_SCHEMA.safeParse(bruto)
  if (!r.success) throw new Error(`evento inválido: ${r.error.message}`)
  // O mesmo teto que a função no banco aplica. Checar dos dois lados evita
  // que um app desatualizado descubra o limite só quando o INSERT falha.
  //
  // Conta code points (`[...texto].length`), não unidades UTF-16 (`.length`):
  // é isso que o Postgres mede em `length(p_dados::text)`. Para qualquer
  // caractere fora do BMP (emoji, por exemplo) o JS enxerga 2 unidades onde
  // o Postgres enxerga 1 caractere — contar `.length` tornaria o cliente
  // mais restritivo que o banco e rejeitaria por engano algo que o banco
  // aceitaria.
  const texto = JSON.stringify(r.data.dados)
  if ([...texto].length > LIMITE_DADOS) {
    throw new Error('dados do evento grande demais (máx. 8 KB)')
  }
  return r.data
}
