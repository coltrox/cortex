import type { NoteComCampos } from './tipos'
import { diaDaSemana } from './formularios'

/**
 * Leituras sobre as notas.
 *
 * Isto vive fora dos componentes porque é a parte que pode estar
 * *silenciosamente* errada: um gasto somado como entrada, um suplemento que
 * não aparece na quarta-feira, uma sangria contada como depósito. Nada disso
 * quebra a tela — só mostra o número errado com toda a confiança do mundo.
 * Fora do JSX, dá para testar.
 */

export function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0
}

export function txt(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

export function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(i => i && typeof i === 'object') as Record<string, unknown>[] : []
}

/** Lista de strings, aceitando também "a, b, c" escrito à mão no YAML. */
export function textos(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x))
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

/* ---------- notas ---------- */

/**
 * Corpo sem o frontmatter, PRESERVANDO a numeração das linhas.
 *
 * O renderizador devolve o número da linha ao clicar numa tarefa, e esse
 * número tem que casar com o arquivo inteiro — se recortássemos o
 * frontmatter, marcar a primeira tarefa escreveria numa linha do YAML.
 * Trocar as linhas do cabeçalho por vazio mantém o alinhamento sem mostrar o
 * YAML, e o split por `/\r\n|\n/` cobre CRLF, que já mordeu este projeto.
 */
export function corpoAlinhado(raw: string): string {
  const linhas = raw.split(/\r\n|\n/)
  if (linhas[0]?.trim() !== '---') return raw
  const fim = linhas.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (fim === -1) return raw
  return linhas.map((l, i) => (i <= fim ? '' : l)).join('\n')
}

/* ---------- grana ---------- */

export type Transacao = {
  dir: 'entrada' | 'saida'
  item: string
  valor: number
  cat: string
  data: string
  path: string
  i: number
  campo: 'transacoes' | 'gastos'
}

/**
 * Todas as transações do vault, mais recentes primeiro.
 *
 * Lê duas listas: `transacoes`, onde o app grava hoje, e `gastos`, o nome
 * antigo. Um item de `gastos` é sempre saída — aquela lista nasceu antes de
 * existir entrada, e reinterpretá-la seria inventar dados que ninguém digitou.
 */
export function extrairTransacoes(notas: NoteComCampos[]): Transacao[] {
  const out: Transacao[] = []
  for (const n of notas) {
    if (!n.date) continue
    for (const [campo, forcarSaida] of [['transacoes', false], ['gastos', true]] as const) {
      lista(n.campos[campo]).forEach((t, i) => {
        out.push({
          dir: forcarSaida || txt(t.dir) !== 'entrada' ? 'saida' : 'entrada',
          item: txt(t.item) || '—',
          valor: num(t.valor),
          cat: txt(t.cat) || 'sem categoria',
          data: n.date as string,
          path: n.path,
          i,
          campo
        })
      })
    }
  }
  return out.sort((a, b) => b.data.localeCompare(a.data))
}

/** Gasto por categoria — só saídas, que é o que faz sentido comparar. */
export function porCategoria(txs: Transacao[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (t.dir !== 'saida') continue
    m.set(t.cat, (m.get(t.cat) ?? 0) + t.valor)
  }
  return m
}

/**
 * `saida` conta como sangria além de `sangria`: foi o vocabulário da primeira
 * versão do formulário, e trocar um rótulo na tela não pode invalidar o que
 * já está gravado em disco.
 */
export function ehSangria(mov: NoteComCampos): boolean {
  const d = txt(mov.campos.direcao)
  return d === 'sangria' || d === 'saida'
}

export function saldoPorquinho(movs: NoteComCampos[]): {
  depositado: number; sangrado: number; saldo: number
} {
  let depositado = 0
  let sangrado = 0
  for (const m of movs) {
    if (ehSangria(m)) sangrado += num(m.campos.valor)
    else depositado += num(m.campos.valor)
  }
  return { depositado, sangrado, saldo: depositado - sangrado }
}

/* ---------- saúde ---------- */

/**
 * Suplementos que entram num dia.
 *
 * Sem `dias` declarado, o suplemento vale todo dia — é o comportamento que
 * não perde nada: um suplemento cadastrado antes de existir o seletor de dias
 * continua aparecendo em vez de sumir da rotina em silêncio.
 */
export function suplementosDoDia(notas: NoteComCampos[], dia: string): NoteComCampos[] {
  const semana = diaDaSemana(dia)
  return notas.filter(n => {
    if (n.tipo !== 'suplemento') return false
    const d = textos(n.campos.dias)
    return d.length === 0 || d.includes(semana)
  })
}

/**
 * Tarefas diárias que entram num dia.
 *
 * Mesma regra dos suplementos, e de propósito: no Hoje as duas listas são o
 * mesmo gesto, uma embaixo da outra. Sem `dias` declarado vale todo dia — é
 * o padrão útil para uma rotina, e é o que o celular já entende.
 */
export function rotinasDoDia(notas: NoteComCampos[], dia: string): NoteComCampos[] {
  const semana = diaDaSemana(dia)
  return notas.filter(n => {
    if (n.tipo !== 'rotina') return false
    const d = textos(n.campos.dias)
    return d.length === 0 || d.includes(semana)
  })
}

/* ---------- vida ---------- */

/**
 * As anotações de um dia, as marcadas na frente.
 *
 * Elas nascem no celular e caem em `Vida/`, misturadas com objetivo, compra e
 * conta. Sem esta leitura, o que se escreveu de manhã no ônibus só reaparece
 * quem for procurar na lente Vida — que é justamente o que ninguém faz no
 * meio do dia.
 */
export function anotacoesDoDia(notas: NoteComCampos[], dia: string): NoteComCampos[] {
  return notas
    .filter(n => n.tipo === 'anotacao' && n.date === dia)
    .sort((a, b) => {
      const pa = a.campos.prioridade === true
      const pb = b.campos.prioridade === true
      return pa === pb ? a.title.localeCompare(b.title) : pa ? -1 : 1
    })
}

/**
 * Calorias e proteína consumidas num dia: as refeições do plano que foram
 * marcadas, mais o que foi comido fora do plano.
 */
export function totaisDoDia(
  plano: NoteComCampos | undefined,
  diario: NoteComCampos | undefined
): { kcal: number; prot: number; marcadas: number; total: number } {
  const refeicoes = lista(plano?.campos.refeicoes)
  const feitas = textos(diario?.campos.dieta_feitas)
  const extras = lista(diario?.campos.extras)

  const doPlano = refeicoes.filter(r => feitas.includes(txt(r.nome)))
  return {
    kcal: doPlano.reduce((s, r) => s + num(r.kcal), 0) + extras.reduce((s, e) => s + num(e.kcal), 0),
    prot: doPlano.reduce((s, r) => s + num(r.prot), 0) + extras.reduce((s, e) => s + num(e.prot), 0),
    marcadas: doPlano.length,
    total: refeicoes.length
  }
}

/**
 * Série de peso ao longo do tempo.
 *
 * Lê `peso` de QUALQUER nota com data — nota de medida, diário, o que for.
 * Quem registra não precisa saber de onde o gráfico lê.
 */
/**
 * Quanta água por dia, do mais antigo para o mais novo.
 *
 * A fonte é o diário, um arquivo por dia — então o histórico já existia desde
 * sempre, só não tinha onde aparecer. Cada `agua_ml` é o total do dia, somado
 * pelos eventos que o celular manda; ver `planejar.ts`.
 *
 * Dia sem o campo fica de fora, e não entra como zero: "não registrei" e
 * "não bebi nada" são coisas diferentes, e um zero inventado afundaria a
 * média de qualquer semana em que o celular ficou sem sinal.
 */
export function serieAgua(notas: NoteComCampos[]): { x: string; y: number }[] {
  return notas
    .filter(n => n.tipo === 'diario' && n.date && typeof n.campos.agua_ml !== 'undefined')
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map(n => ({ x: n.date as string, y: num(n.campos.agua_ml) }))
}

/**
 * Em litros, com uma casa: "1,6 L" se lê melhor que "1600 ml".
 *
 * Mesma forma da `litros` do app web (`web/src/cardapio.ts`). São duas
 * cópias de propósito — o app web não importa nada do renderer —, mas a
 * forma tem que bater: os dois mostram o mesmo número do mesmo dia, e uma
 * tela dizendo "2,4 L" e a outra "2.400 ml" faz a pessoa desconfiar de qual
 * das duas está certa.
 */
export function litros(ml: number): string {
  return (ml / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1
  }) + ' L'
}

export function seriePeso(notas: NoteComCampos[]): { x: string; y: number }[] {
  return notas
    .filter(n => n.date && typeof n.campos.peso !== 'undefined')
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map(n => ({ x: n.date as string, y: num(n.campos.peso) }))
}
