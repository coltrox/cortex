import { ESPECIES_CARDAPIO, type ItemCardapio } from '@compartilhado/eventos'
import type { Guardado } from './guardado'

const CHAVE = 'cortex.cardapio'

// Vem do contrato compartilhado, e nao de uma copia local. Havia tres listas
// iguais deste conjunto -- aqui, em nuvem.ts e no schema.sql -- e acrescentar
// uma especie nova sem lembrar das tres a fazia sumir em silencio no meio do
// caminho. Foi exatamente o que aconteceu com prova/compromisso/tarefa.
const ESPECIES = ESPECIES_CARDAPIO

/**
 * Os ids de dia da semana do Cortex, na ordem de `Date.getDay()`.
 *
 * São exatamente os de `src/renderer/formularios.tsx` — sem acento em `sab`.
 * Divergir aqui faria o suplemento de sábado nunca aparecer.
 */
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

export type Cardapio = { itens: ItemCardapio[]; atualizadoEm: string | null }

const VAZIO: Cardapio = { itens: [], atualizadoEm: null }

/**
 * O cardápio fica guardado no aparelho.
 *
 * Não é cache por desempenho: é o que faz o app abrir com os suplementos e as
 * refeições do dia mesmo sem sinal, que é metade do motivo de ele existir.
 */
export function lerCardapio(g: Guardado): Cardapio {
  const bruto = g.ler(CHAVE)
  if (!bruto) return VAZIO
  let cru: unknown
  try {
    cru = JSON.parse(bruto)
  } catch {
    return VAZIO
  }
  if (!cru || typeof cru !== 'object') return VAZIO
  const o = cru as Record<string, unknown>

  const itens: ItemCardapio[] = []
  for (const linha of Array.isArray(o.itens) ? o.itens : []) {
    if (!linha || typeof linha !== 'object') continue
    const l = linha as Record<string, unknown>
    const especie = ESPECIES.find(e => e === l.especie)
    if (!especie || typeof l.nome !== 'string') continue
    itens.push({
      especie,
      nome: l.nome,
      detalhe: l.detalhe && typeof l.detalhe === 'object' && !Array.isArray(l.detalhe)
        ? (l.detalhe as Record<string, unknown>)
        : {}
    })
  }
  return { itens, atualizadoEm: typeof o.atualizadoEm === 'string' ? o.atualizadoEm : null }
}

export function gravarCardapio(g: Guardado, itens: ItemCardapio[], quando: string): void {
  g.gravar(CHAVE, JSON.stringify({ itens, atualizadoEm: quando }))
}

/** O dia da semana de uma data ISO, no vocabulário do Cortex. */
export function diaDaSemana(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  return SEMANA[new Date(a, m - 1, d).getDay()]
}

export function suplementosDoDia(c: Cardapio, dia: string): ItemCardapio[] {
  const hoje = diaDaSemana(dia)
  return c.itens.filter(i => {
    if (i.especie !== 'suplemento') return false
    const dias = i.detalhe.dias
    // Sem lista de dias significa "todo dia". É o que o Cortex publica para um
    // suplemento cadastrado sem marcar dia nenhum, e o padrão útil.
    if (!Array.isArray(dias) || dias.length === 0) return true
    return dias.some(d => String(d) === hoje)
  })
}

/**
 * As tarefas diárias de hoje.
 *
 * Mesma regra dos suplementos, e de propósito: no Hoje elas são o mesmo gesto,
 * logo abaixo. Sem lista de dias significa "todo dia" — que é o padrão útil
 * para uma rotina, e é o que o Cortex publica quando ninguém marcou dia.
 */
export function rotinasDoDia(c: Cardapio, dia: string): ItemCardapio[] {
  const hoje = diaDaSemana(dia)
  return c.itens.filter(i => {
    if (i.especie !== 'rotina') return false
    const dias = i.detalhe.dias
    if (!Array.isArray(dias) || dias.length === 0) return true
    return dias.some(d => String(d) === hoje)
  })
}

/**
 * O momento de tomar (ou de fazer), que nunca some da tela.
 *
 * A dose some quando não existe — "6 g" só faz sentido se alguém escreveu 6 g.
 * O momento não: um item sem `quando` não é um item sem hora, é um item que
 * pode ser a qualquer hora, e a linha em branco fazia parecer falta de dado.
 *
 * "qualquer hora" é o vocabulário que o próprio Cortex já usa nas rotinas
 * (ver as opções de `quando` em `formularios.tsx`), então a tela não inventa
 * palavra nova para dizer a mesma coisa.
 */
export function momentoDe(i: ItemCardapio): string {
  const q = i.detalhe.quando
  return typeof q === 'string' && q.trim() !== '' ? q : 'qualquer hora'
}

/**
 * As áreas que o dono ligou no Cortex — ou `null` quando não dá para saber.
 *
 * `null` é a resposta honesta para um cardápio que não traz nenhuma área:
 * Cortex antigo, ou o SQL da espécie `area` ainda não rodado. Quem chama
 * trata `null` como "mostra tudo".
 *
 * A distinção importa porque as duas situações se parecem no dado e são
 * opostas na intenção. Se ausência virasse lista vazia, quem só esqueceu de
 * atualizar o Cortex abriria o celular e encontraria um app sem nada dentro —
 * e concluiria, com razão, que quebrou.
 */
export function areasLigadas(c: Cardapio): string[] | null {
  const ligadas = c.itens.filter(i => i.especie === 'area').map(i => i.nome)
  return ligadas.length > 0 ? ligadas : null
}

/**
 * Esta área está ligada?
 *
 * Sem saber, responde que sim — ver `areasLigadas`. É a resposta que mantém
 * o app inteiro na tela enquanto o Cortex não republica.
 */
export function areaLigada(c: Cardapio, area: string): boolean {
  const ligadas = areasLigadas(c)
  return ligadas === null || ligadas.includes(area)
}

export type AnotacaoPublicada = {
  titulo: string
  texto: string
  prioridade: boolean
  /** O dia em que foi escrita, ISO. Ausente na permanente. */
  data?: string
  /** O markdown escrito no Cortex, quando há. */
  corpo?: string
  /** Sem data: fica na tela todo dia, em vez de sumir na virada. */
  permanente?: boolean
}

/**
 * TODAS as anotações que o Cortex devolveu.
 *
 * O Cortex passou a publicar o conjunto inteiro, e não mais só o do dia — a
 * decisão de o que mostrar mudou de lado, e agora é da tela. Esta função é a
 * da tela Notas; o Hoje usa `anotacoesDoDia`, logo abaixo.
 *
 * Prioridade primeiro, depois da mais nova para a mais velha, e por último em
 * ordem de título. A permanente não tem data e vai junto das mais novas: ela
 * não é velha, é atemporal. Dentro de um mesmo dia a ordem é por título, e
 * não por hora, porque anotação no vault guarda só o DIA — inventar uma ordem
 * cronológica a partir do que não existe daria uma lista que muda de ordem
 * sozinha a cada publicação.
 */
export function todasAnotacoes(c: Cardapio): AnotacaoPublicada[] {
  return c.itens
    .filter(i => i.especie === 'anotacao')
    .map(i => ({
      titulo: i.nome,
      // Sem `texto` sobra o título, que é a primeira linha dela — melhor do
      // que uma linha em branco na tela.
      texto: typeof i.detalhe.texto === 'string' && i.detalhe.texto !== ''
        ? i.detalhe.texto
        : i.nome,
      prioridade: i.detalhe.prioridade === true,
      data: typeof i.detalhe.data === 'string' && i.detalhe.data !== ''
        ? i.detalhe.data
        : undefined,
      corpo: typeof i.detalhe.corpo === 'string' && i.detalhe.corpo !== ''
        ? i.detalhe.corpo
        : undefined,
      permanente: i.detalhe.permanente === true ? true : undefined
    }))
    .sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1
      // Sem data vem antes: a permanente não é antiga, é de todo dia.
      if (!a.data !== !b.data) return a.data ? 1 : -1
      if (a.data && b.data && a.data !== b.data) return b.data.localeCompare(a.data)
      return a.titulo.localeCompare(b.titulo)
    })
}

/**
 * Só as de hoje — e as que não têm dia nenhum.
 *
 * A sem data entra todo dia de propósito, por dois motivos que apontam para
 * a mesma regra:
 *
 * 1. A permanente. Quem escreve "senha do wifi da casa da minha mãe" não põe
 *    data nisso — não é registro do dia, é coisa para consultar, e sumiria
 *    da tela se o corte fosse só pelo dia.
 * 2. O cardápio antigo. Até esta versão o Cortex publicava só as de hoje e
 *    NÃO mandava a data. Se "sem data" quisesse dizer "não é de hoje", a
 *    seção de anotações do celular ficaria vazia entre o app web atualizar e
 *    o Cortex republicar — e ninguém entenderia por quê.
 *
 * As duas leituras dão na mesma conta, então a regra é uma só.
 */
export function anotacoesDoDia(c: Cardapio, dia: string): AnotacaoPublicada[] {
  return todasAnotacoes(c).filter(a => a.data === undefined || a.data === dia)
}

export type Hidratacao = { nome: string; meta: number; copo: number; ml: number }

/**
 * A agua do dia: quanto ja foi, a meta, e de quanto e a garrafa.
 *
 * Devolve `null` quando não há nota de hidratação no Cortex — e aí a seção
 * inteira some da tela, em vez de aparecer um contador de uma meta que
 * ninguém definiu.
 *
 * Os padroes existem para o caso de a nota vir sem os numeros: uma garrafa de
 * 250 ml e um copo comum, e sem meta o contador ainda conta.
 */
export function hidratacao(c: Cardapio): Hidratacao | null {
  const i = c.itens.find(x => x.especie === 'hidratacao')
  if (!i) return null
  const n = (v: unknown, padrao: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : padrao
  return {
    nome: i.nome,
    meta: n(i.detalhe.meta, 0),
    copo: n(i.detalhe.copo, 250),
    // O total pode faltar (nenhum gole hoje), e ai e zero.
    ml: typeof i.detalhe.ml === 'number' && Number.isFinite(i.detalhe.ml) ? i.detalhe.ml : 0
  }
}

/** Em litros, com uma casa: "1,6 L" se lê melhor que "1600 ml". */
export function litros(ml: number): string {
  return (ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L'
}

export function refeicoesDoPlano(c: Cardapio): ItemCardapio[] {
  // Na ordem do dia, nao na ordem em que o banco devolveu: o almoco aparecer
  // antes do cafe faz a pessoa procurar na lista o que deveria estar na
  // frente dela. `HH:MM` ordena igual em texto e no relogio.
  //
  // Refeicao sem hora vai para o fim, e nao para o comeco: sem hora marcada
  // ela e o extra, nao a primeira do dia.
  return c.itens
    .filter(i => i.especie === 'refeicao')
    .sort((x, y) => {
      const a = typeof x.detalhe.hora === 'string' && x.detalhe.hora !== '' ? x.detalhe.hora : '99:99'
      const b = typeof y.detalhe.hora === 'string' && y.detalhe.hora !== '' ? y.detalhe.hora : '99:99'
      return a < b ? -1 : a > b ? 1 : x.nome.localeCompare(y.nome)
    })
}

export function treinos(c: Cardapio): ItemCardapio[] {
  return c.itens.filter(i => i.especie === 'treino')
}

export type ExercicioDoModelo = { nome: string; series?: number; reps?: string }

export function exerciciosDoTreino(t: ItemCardapio): ExercicioDoModelo[] {
  const cru = t.detalhe.exercicios
  if (!Array.isArray(cru)) return []
  const out: ExercicioDoModelo[] = []
  for (const e of cru) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    if (typeof o.nome !== 'string' || o.nome === '') continue
    const item: ExercicioDoModelo = { nome: o.nome }
    if (typeof o.series === 'number') item.series = o.series
    if (typeof o.reps === 'string') item.reps = o.reps
    out.push(item)
  }
  return out
}

export function provas(c: Cardapio): ItemCardapio[] {
  return porData(c.itens.filter(i => i.especie === 'prova'), 'data')
}

export function compromissos(c: Cardapio): ItemCardapio[] {
  return porData(c.itens.filter(i => i.especie === 'compromisso'), 'data')
}

export function tarefas(c: Cardapio): ItemCardapio[] {
  return porData(c.itens.filter(i => i.especie === 'tarefa'), 'prazo')
}

/**
 * Ordena pela data, como texto.
 *
 * `YYYY-MM-DD` ordena igual em texto e no tempo, então não é preciso
 * construir um Date por item só para comparar — e construir Date a partir de
 * texto é justamente onde o fuso costuma entrar sem ser convidado.
 */
function porData(itens: ItemCardapio[], campo: string): ItemCardapio[] {
  return [...itens].sort((a, b) => {
    const x = typeof a.detalhe[campo] === 'string' ? (a.detalhe[campo] as string) : '9999'
    const y = typeof b.detalhe[campo] === 'string' ? (b.detalhe[campo] as string) : '9999'
    return x < y ? -1 : x > y ? 1 : a.nome.localeCompare(b.nome)
  })
}

/** O caminho da nota, que é como o celular devolve a referência ao Cortex. */
export function caminhoDe(i: ItemCardapio): string {
  return typeof i.detalhe.path === 'string' ? i.detalhe.path : ''
}

/** A data de um item, seja ela `data` (prova, compromisso) ou `prazo` (tarefa). */
export function dataDe(i: ItemCardapio): string {
  const v = i.detalhe.data ?? i.detalhe.prazo
  return typeof v === 'string' ? v : ''
}

/**
 * A data em si, curta.
 *
 * `faltam()` responde "quando", mas não responde "que dia" — e para marcar
 * algo na cabeça, ou conferir contra o que está escrito no caderno, é a data
 * que serve. As duas aparecem juntas: "12 set · em 3 dias".
 *
 * O `Date` é montado a partir dos campos separados, nunca de `new Date(iso)`:
 * a string ISO é lida como UTC, e num fuso negativo isso volta um dia — a
 * prova de segunda apareceria como domingo.
 *
 * Mesmo formato do Cortex (`dataCurta` em `src/renderer/components/base.tsx`).
 * Duas telas do mesmo sistema escrevendo a mesma data de jeitos diferentes é
 * o tipo de detalhe que faz a pessoa desconfiar de qual das duas está certa.
 */
export function dataCurta(iso: string, hoje: string): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  const data = new Date(a, m - 1, d)
  if (Number.isNaN(data.getTime())) return iso
  const mes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  // O ano só aparece quando não é o corrente: repetir "2026" em toda linha
  // gasta espaço de tela sem dizer nada.
  return a === Number(hoje.slice(0, 4)) ? `${d} ${mes}` : `${d} ${mes} ${a}`
}

/**
 * Quantos dias faltam, em texto curto para caber no celular.
 *
 * Faz a conta em dias de calendário, não em milissegundos: com milissegundos,
 * uma prova às 8h de amanhã "falta 0 dias" às 23h de hoje, e a tela mentiria.
 */
export function faltam(data: string, hoje: string): string {
  if (!data) return ''
  const dias = Math.round(
    (Date.parse(`${data}T00:00:00`) - Date.parse(`${hoje}T00:00:00`)) / 86_400_000
  )
  if (Number.isNaN(dias)) return ''
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`
}

/**
 * Há quanto tempo os dados chegaram, em texto curto.
 *
 * Serve a uma pergunta só, e ela é a que leva alguém a abrir os Ajustes:
 * "isto ainda está funcionando?". Um horário exato não responde — "12:41"
 * obriga a pessoa a olhar o relógio e fazer conta.
 *
 * Não é um botão de atualizar, e não vira um: buscar é trabalho do app.
 */
export function haQuantoTempo(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return ''
  const quando = Date.parse(iso)
  if (Number.isNaN(quando)) return ''
  const seg = Math.max(0, Math.round((agora.getTime() - quando) / 1000))
  if (seg < 90) return 'agora mesmo'
  const min = Math.round(seg / 60)
  if (min < 60) return `há ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.round(horas / 24)
  return dias === 1 ? 'ontem' : `há ${dias} dias`
}

export type Porquinho = { nome: string; saldo: number; alvo: number | null; ate: string | null }

/**
 * O porquinho, quando o Cortex publicou um.
 *
 * O saldo vem somado de lá: o celular não recebe os movimentos, só o total.
 */
export function porquinho(c: Cardapio): Porquinho | null {
  const i = c.itens.find(x => x.especie === 'porquinho')
  if (!i) return null
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    nome: i.nome,
    saldo: n(i.detalhe.saldo) ?? 0,
    alvo: n(i.detalhe.alvo),
    ate: typeof i.detalhe.ate === 'string' ? i.detalhe.ate : null
  }
}

/** Dinheiro em português, com o símbolo e duas casas. */
export function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/* ─────────── O histórico que o Cortex passou a publicar ───────────
   Três espécies que não são catálogo do dia: são o que já aconteceu. Elas
   existem para o celular MOSTRAR evolução — até então ele só sabia enviar
   peso, cardio e gasto, nunca recebê-los de volta. */

const numOu = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : padrao
const numOuNulo = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

export type Medida = {
  data: string
  peso: number | null
  gordura: number | null
  cintura: number | null
  quadril: number | null
  braco: number | null
  coxa: number | null
  peito: number | null
  panturrilha: number | null
}

/**
 * As medições, da mais ANTIGA para a mais nova.
 *
 * Ao contrário de quase todas as outras listas deste arquivo, que vêm do mais
 * novo para o mais velho. O motivo é o gráfico: uma sequência no tempo se lê
 * da esquerda para a direita, e inverter no componente seria espalhar a regra
 * de ordem por duas camadas.
 */
export function medidas(c: Cardapio): Medida[] {
  return c.itens
    .filter(i => i.especie === 'medida' && texto(i.detalhe.data) !== '')
    .map(i => ({
      data: texto(i.detalhe.data),
      peso: numOuNulo(i.detalhe.peso),
      gordura: numOuNulo(i.detalhe.gordura),
      cintura: numOuNulo(i.detalhe.cintura),
      quadril: numOuNulo(i.detalhe.quadril),
      braco: numOuNulo(i.detalhe.braco),
      coxa: numOuNulo(i.detalhe.coxa),
      peito: numOuNulo(i.detalhe.peito),
      panturrilha: numOuNulo(i.detalhe.panturrilha)
    }))
    .sort((a, b) => a.data.localeCompare(b.data))
}

export type Cardio = {
  data: string
  aparelho: string
  minutos: number
  distancia: number | null
  pace: string
}

/** As sessões de cardio, da mais NOVA para a mais velha. */
export function cardios(c: Cardapio): Cardio[] {
  return c.itens
    .filter(i => i.especie === 'cardio' && texto(i.detalhe.data) !== '')
    .map(i => ({
      data: texto(i.detalhe.data),
      aparelho: texto(i.detalhe.aparelho),
      minutos: numOu(i.detalhe.minutos, 0),
      distancia: numOuNulo(i.detalhe.distancia),
      pace: texto(i.detalhe.pace)
    }))
    .sort((a, b) => b.data.localeCompare(a.data))
}

export type Transacao = {
  data: string
  item: string
  valor: number
  cat: string
  entrada: boolean
}

/**
 * Os lançamentos, do mais NOVO para o mais velho.
 *
 * `entrada` é booleano aqui, e string `dir` no banco: a tela pergunta "isto
 * somou ou subtraiu?", e comparar com a palavra 'entrada' em cada lugar que
 * usa seria a mesma regra escrita cinco vezes.
 */
export function transacoes(c: Cardapio): Transacao[] {
  return c.itens
    .filter(i => i.especie === 'transacao' && texto(i.detalhe.data) !== '')
    .map(i => ({
      data: texto(i.detalhe.data),
      item: texto(i.detalhe.item),
      valor: numOu(i.detalhe.valor, 0),
      cat: texto(i.detalhe.cat),
      entrada: texto(i.detalhe.dir) === 'entrada'
    }))
    .sort((a, b) => b.data.localeCompare(a.data))
}

/**
 * Quanto saiu e quanto entrou num mês, em reais.
 *
 * `mes` é o prefixo ISO `AAAA-MM`. Comparar por prefixo de string, e não
 * construindo `Date`: a data já vem em ISO, e `new Date('2026-09-01')` é
 * interpretada como UTC — num fuso negativo ela vira 31 de agosto, e o
 * primeiro dia do mês cairia fora da própria conta do mês.
 */
export function totaisDoMes(ts: Transacao[], mes: string): { saiu: number; entrou: number } {
  let saiu = 0
  let entrou = 0
  for (const t of ts) {
    if (!t.data.startsWith(mes)) continue
    if (t.entrada) entrou += t.valor
    else saiu += t.valor
  }
  // Ao centavo: somar float acumula 0.30000000000000004, e esse número
  // chegaria à tela do jeito que está.
  return { saiu: Math.round(saiu * 100) / 100, entrou: Math.round(entrou * 100) / 100 }
}
