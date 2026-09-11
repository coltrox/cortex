import type { NoteComCampos } from './tipos'
import { diaDaSemana, FORMULARIOS, type TipoCampo } from './formularios'
import { proximaOcorrencia, anosCompletados } from '../shared/datas'

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

/* ---------- os campos de uma nota ---------- */

/**
 * As chaves que NÃO viram linha na nota aberta.
 *
 * Ou já aparecem no cabeçalho (`title`, `tipo`, `date`, `project`), ou são
 * encanamento do arquivo (`created`, `updated`, `origem`). Repetir o título
 * logo abaixo do título é ruído.
 */
const CHAVES_DE_CABECALHO = new Set([
  'titulo', 'title', 'tipo', 'date', 'data', 'project', 'created', 'updated', 'origem'
])

export type CampoExibido = {
  k: string
  rotulo: string
  tipo: TipoCampo
  valor: unknown
}

/** `dataNascimento` → `Data nascimento`. Para campo que ninguém declarou. */
function humanizar(k: string): string {
  const solto = k.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return solto.charAt(0).toUpperCase() + solto.slice(1)
}

/** Vazio de verdade: nem string em branco, nem lista sem itens. */
function vazio(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

/**
 * Os campos de uma nota, prontos para desenhar.
 *
 * Existe porque a nota criada por formulário abria EM BRANCO: os dados iam
 * todos para o frontmatter, o corpo ficava vazio, e quem achasse a nota pela
 * busca via um título e mais nada. A senha estava lá no arquivo — só não na
 * tela.
 *
 * A ordem é a do formulário do tipo, porque é a ordem em que a pessoa
 * digitou. O que o formulário não conhece vem depois, em ordem alfabética:
 * nota escrita à mão, ou campo de uma versão antiga do app, também aparece.
 *
 * Ler do frontmatter em vez de escrever no corpo é o que faz isto valer para
 * as notas que JÁ existem, e o que evita ter o mesmo dado em dois lugares se
 * desencontrando na primeira edição.
 */
export function camposExibiveis(nota: NoteComCampos): CampoExibido[] {
  const campos = nota.campos ?? {}
  const definidos = FORMULARIOS[nota.tipo]?.campos ?? []
  const saida: CampoExibido[] = []
  const vistos = new Set<string>()

  for (const d of definidos) {
    vistos.add(d.k)
    if (CHAVES_DE_CABECALHO.has(d.k)) continue
    const valor = campos[d.k]
    if (vazio(valor)) continue
    saida.push({ k: d.k, rotulo: d.rotulo, tipo: d.tipo, valor })
  }

  const sobras = Object.keys(campos)
    .filter(k => !vistos.has(k) && !CHAVES_DE_CABECALHO.has(k) && !vazio(campos[k]))
    .sort()
  for (const k of sobras) {
    // `tags` é lista de palavras e já tem lugar próprio no cabeçalho de quem
    // desenha; aqui ela entraria como texto solto sem dizer que é etiqueta.
    saida.push({ k, rotulo: humanizar(k), tipo: k === 'tags' ? 'itens' : 'texto', valor: campos[k] })
  }
  return saida
}

/**
 * O valor de um campo em texto.
 *
 * Lista de objetos — o tipo `itens`, usado por exercícios e refeições — vira
 * uma linha por item, com os valores separados por ponto. Sem isto ela sairia
 * como `[object Object]`, que foi exatamente o que apareceu na primeira
 * versão desta tela.
 */
export function textoDoCampo(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'string') return valor.trim()
  if (Array.isArray(valor)) {
    // Lista de OBJETOS — exercícios, refeições, transações — sai uma por
    // linha, porque cada item é um registro com vários dados. Lista de
    // palavras — os dias da semana, as tags — sai em linha, com vírgula:
    // quebrar `seg` e `qua` em duas linhas transforma duas palavras num
    // parágrafo.
    const registros = valor.some(item => item !== null && typeof item === 'object')
    return valor
      .map(item =>
        item && typeof item === 'object'
          ? Object.values(item as Record<string, unknown>)
              .filter(v => !vazio(v))
              .map(v => textoDoCampo(v))
              .join(' · ')
          : textoDoCampo(item))
      .filter(s => s !== '')
      .join(registros ? '\n' : ', ')
  }
  if (typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => !vazio(v))
      .map(([k, v]) => `${humanizar(k)}: ${textoDoCampo(v)}`)
      .join('\n')
  }
  return String(valor)
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

/* ---------- datas que voltam todo ano ---------- */

export type DataComemorativa = {
  path: string
  titulo: string
  /** Quando cai da próxima vez, já resolvida para um ano concreto. */
  quando: string
  /** `aniversário`, `casamento`, `falecimento`… vazio quando não se disse. */
  oque: string
  /** Quantos anos faz nessa ocorrência — `null` sem o ano de origem. */
  anos: number | null
}

/**
 * As datas comemorativas que vêm por aí, do mais próximo ao mais distante.
 *
 * Duas fontes, e de propósito. A nota `data-comemorativa` cobre casamento,
 * formatura e falecimento; a nota `pessoa` cobre o aniversário de quem já
 * está cadastrado — sem isso, cadastrar alguém e depois criar a data dela
 * seria digitar o mesmo nome duas vezes, e o aniversário acabaria escrito
 * dentro do campo `papel`, que foi o que aconteceu de verdade.
 *
 * `dias` limita a janela. Sem limite, trinta aniversários apareceriam
 * inteiros em toda tela, e o que interessa é o que está chegando.
 */
export function datasComemorativas(
  notas: NoteComCampos[], hoje: string, dias = 60
): DataComemorativa[] {
  const limite = emDias(hoje, dias)
  const out: DataComemorativa[] = []

  const juntar = (
    n: NoteComCampos, titulo: string, d: unknown, m: unknown, ano: unknown, oque: string
  ): void => {
    const quando = proximaOcorrencia(num(d), num(m), hoje)
    if (!quando || quando > limite) return
    out.push({ path: n.path, titulo, quando, oque, anos: anosCompletados(ano, quando) })
  }

  for (const n of notas.filter(x => x.tipo === 'data-comemorativa')) {
    juntar(n, n.title, n.campos.dia, n.campos.mes, n.campos.ano, txt(n.campos.oque))
  }
  for (const n of notas.filter(x => x.tipo === 'pessoa')) {
    // Sem dia e mês a pessoa simplesmente não tem aniversário cadastrado —
    // não é erro, é o caso normal de quem foi cadastrado pelo telefone.
    if (n.campos.nascimento_dia === undefined) continue
    juntar(
      n, `Aniversário — ${n.title}`,
      n.campos.nascimento_dia, n.campos.nascimento_mes, n.campos.nascimento_ano,
      'aniversário'
    )
  }

  return out.sort((a, b) => (a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : 0))
}

/** `hoje` mais N dias, em ISO. Monta pelo `Date` local, nunca por UTC. */
function emDias(hoje: string, dias: number): string {
  const [a, m, d] = hoje.split('-').map(Number)
  const data = new Date(a, m - 1, d + dias)
  const dois = (n: number): string => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
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
 * Quanto de cada refeição foi comido, pelo que o celular registrou.
 *
 * `dieta_detalhes` é gravado por `nuvem/planejar.ts` quando alguém responde
 * "comi metade" no celular. Sem detalhe, o fator é 1: marcar sempre quis
 * dizer "comi tudo", e todo dia gravado antes disto significa exatamente isso.
 */
export function fatorDaRefeicao(diario: NoteComCampos | undefined, nome: string): number {
  const d = lista(diario?.campos.dieta_detalhes).find(x => txt(x.nome) === nome)
  const nivel = txt(d?.nivel)
  return nivel === 'metade' ? 0.5 : nivel === 'pouco' ? 0.25 : 1
}

/** O que foi comido no lugar da refeição do plano, quando houve troca. */
export function trocaDaRefeicao(diario: NoteComCampos | undefined, nome: string): string {
  return txt(lista(diario?.campos.dieta_detalhes).find(x => txt(x.nome) === nome)?.troca)
}

/**
 * Calorias e proteína consumidas num dia: as refeições do plano que foram
 * marcadas, mais o que foi comido fora do plano.
 *
 * Meio prato conta meia caloria. O Cortex e o celular têm que chegar ao MESMO
 * número — duas contas diferentes para o mesmo dia é a situação em que a
 * pessoa deixa de acreditar nas duas.
 */
export function totaisDoDia(
  plano: NoteComCampos | undefined,
  diario: NoteComCampos | undefined
): { kcal: number; prot: number; marcadas: number; total: number } {
  const refeicoes = lista(plano?.campos.refeicoes)
  const feitas = textos(diario?.campos.dieta_feitas)
  const extras = lista(diario?.campos.extras)

  const doPlano = refeicoes.filter(r => feitas.includes(txt(r.nome)))
  const pesado = (campo: 'kcal' | 'prot'): number => Math.round(
    doPlano.reduce((s, r) => s + num(r[campo]) * fatorDaRefeicao(diario, txt(r.nome)), 0)
  )
  return {
    kcal: pesado('kcal') + extras.reduce((s, e) => s + num(e.kcal), 0),
    prot: pesado('prot') + extras.reduce((s, e) => s + num(e.prot), 0),
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
