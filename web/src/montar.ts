import { validarEvento, type Evento } from '@compartilhado/eventos'

/**
 * A tradução da tabela de eventos da spec, campo a campo.
 *
 * Este é o único arquivo do app web que decide nome de campo, e por isso o
 * único que precisa combinar exatamente com o que o Cortex já lê. O app não
 * inventa vocabulário: ele alimenta as lentes que já existem.
 *
 * Toda função aqui é pura e passa por `validarEvento` antes de devolver — o
 * erro aparece na tela, com o formulário ainda aberto, em vez de virar um
 * item que a fila descarta depois sem ninguém entender.
 */

/**
 * A data de hoje no fuso de quem está segurando o celular.
 *
 * Não use `toISOString()`: ele converte para UTC, e num fuso negativo isso
 * devolve o dia seguinte a partir das 21h. O registro cairia no diário de
 * amanhã, e a pessoa só descobriria dias depois.
 */
export function diaLocal(d: Date = new Date()): string {
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

export type ExercicioFeito = {
  nome: string
  series?: number
  reps?: string
  carga?: number
}

/** Texto obrigatório: sem espaço em volta, nunca vazio. */
function texto(v: string, campo: string): string {
  const t = v.trim()
  if (!t) throw new Error(`${campo} não pode ficar em branco`)
  return t
}

/** Número obrigatório: NaN e infinito não passam. */
function numero(v: number, campo: string): number {
  if (!Number.isFinite(v)) throw new Error(`${campo} precisa ser um número`)
  return v
}

/**
 * Monta o objeto de dados deixando de fora o que não foi preenchido.
 *
 * Campo vazio precisa sumir, não virar string vazia: o Cortex escreve isso no
 * frontmatter do vault, e uma chave vazia lá é ruído que aparece em toda
 * lente que lê a nota.
 */
function comValor(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'number' && !Number.isFinite(v)) continue
    out[k] = v
  }
  return out
}

export function eventoSuplemento(nome: string, dia: string = diaLocal()): Evento {
  return validarEvento({ tipo: 'suplemento', dia, dados: { nome: texto(nome, 'nome') } })
}

export function eventoRefeicaoPlano(nome: string, dia: string = diaLocal()): Evento {
  return validarEvento({ tipo: 'refeicao_plano', dia, dados: { nome: texto(nome, 'nome') } })
}

export function eventoRefeicaoExtra(
  item: string,
  extras: { kcal?: number; prot?: number } = {},
  dia: string = diaLocal()
): Evento {
  return validarEvento({
    tipo: 'refeicao_extra',
    dia,
    dados: comValor({ item: texto(item, 'item'), kcal: extras.kcal, prot: extras.prot })
  })
}

export function eventoGasto(
  item: string,
  valor: number,
  extras: { cat?: string; dir?: string } = {},
  dia: string = diaLocal()
): Evento {
  return validarEvento({
    tipo: 'gasto',
    dia,
    dados: comValor({
      item: texto(item, 'item'),
      valor: numero(valor, 'valor'),
      cat: extras.cat?.trim(),
      dir: extras.dir?.trim()
    })
  })
}

export function eventoSessao(
  modelo: string,
  exercicios: ExercicioFeito[],
  dia: string = diaLocal()
): Evento {
  // Exercício sem nome é linha que ficou em branco no formulário, não dado.
  const feitos = exercicios
    .filter(e => e.nome.trim() !== '')
    .map(e => comValor({
      nome: e.nome.trim(),
      series: e.series,
      reps: e.reps?.trim(),
      carga: e.carga
    }))
  if (feitos.length === 0) throw new Error('o treino precisa de pelo menos um exercício')
  return validarEvento({
    tipo: 'sessao',
    dia,
    dados: { modelo: texto(modelo, 'modelo'), exercicios: feitos }
  })
}

export function eventoCardio(
  aparelho: string,
  minutos: number,
  extras: { distancia?: number; pace?: string; nivel?: number } = {},
  dia: string = diaLocal()
): Evento {
  return validarEvento({
    tipo: 'cardio',
    dia,
    dados: comValor({
      aparelho: texto(aparelho, 'aparelho'),
      minutos: numero(minutos, 'minutos'),
      distancia: extras.distancia,
      pace: extras.pace?.trim(),
      nivel: extras.nivel
    })
  })
}

export function eventoMedida(campos: Record<string, number>, dia: string = diaLocal()): Evento {
  const dados = comValor(campos)
  if (Object.keys(dados).length === 0) throw new Error('preencha ao menos uma medida')
  return validarEvento({ tipo: 'medida', dia, dados })
}

export function eventoPeso(peso: number, dia: string = diaLocal()): Evento {
  return validarEvento({ tipo: 'peso', dia, dados: { peso: numero(peso, 'peso') } })
}

export function eventoAnotacao(conteudo: string, dia: string = diaLocal()): Evento {
  return validarEvento({ tipo: 'anotacao', dia, dados: { texto: texto(conteudo, 'texto') } })
}

/*
 * Agenda e estudos.
 *
 * Os dois de marcar mandam o `path` que o próprio Cortex publicou no
 * cardápio, e não o título: dois compromissos "Dentista" em semanas
 * diferentes têm o mesmo título e caminhos diferentes, e casar por título
 * cancelaria o errado.
 */

export function eventoProvaEstudada(path: string, dia: string = diaLocal()): Evento {
  return validarEvento({ tipo: 'prova_estudada', dia, dados: { path: texto(path, 'prova') } })
}

export function eventoCompromissoCancelado(path: string, dia: string = diaLocal()): Evento {
  return validarEvento({
    tipo: 'compromisso_cancelado', dia, dados: { path: texto(path, 'compromisso') }
  })
}

export function eventoCompromisso(
  titulo: string,
  data: string,
  extras: { hora?: string; local?: string } = {},
  dia: string = diaLocal()
): Evento {
  // A data do compromisso não é a de hoje: marcar no celular um dentista de
  // semana que vem tem de cair na semana que vem.
  const quando = data.trim() || dia
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quando)) throw new Error('data precisa ser AAAA-MM-DD')
  return validarEvento({
    tipo: 'compromisso',
    dia,
    dados: comValor({
      titulo: texto(titulo, 'o quê'),
      data: quando,
      hora: extras.hora?.trim(),
      local: extras.local?.trim()
    })
  })
}
