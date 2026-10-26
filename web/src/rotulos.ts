/**
 * Os rótulos curtos dos cartões de estudo.
 *
 * Existem por uma medida: o cartão do celular tem 343 px e o título de um dia
 * do cronograma tem 44 caracteres ("19/10 seg — Matemática: razão, proporção
 * e %"). Com a data repetida dentro do título e as etiquetas disputando a
 * mesma linha, o título era espremido em 122 px e quebrava em três linhas —
 * foi exatamente o "encavalou tudo".
 *
 * A saída é não repetir: a data vira uma linha própria, em cima, e o título
 * perde o prefixo de data que já está ali.
 */

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * `2026-10-19` vira `SEG, 19/10`.
 *
 * O dia da semana é calculado a partir da data, e não lido do título: título
 * é texto escrito à mão, e já veio com o dia errado quando uma data do
 * cronograma foi remarcada.
 *
 * Data vazia ou torta devolve string vazia, e a tela simplesmente não mostra
 * a linha — melhor que um "NaN/NaN" no cartão.
 */
export function rotuloData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!m) return ''
  const [, a, mes, d] = m
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)))
  if (Number.isNaN(data.getTime())) return ''
  return `${DIAS[data.getUTCDay()].toUpperCase()}, ${d}/${mes}`
}

/**
 * Tira do título o prefixo de data, que a linha de cima já mostra.
 *
 * `19/10 seg — Matemática: razão, proporção e %` vira
 * `Matemática: razão, proporção e %`.
 *
 * Só corta quando reconhece o padrão inteiro — dia, mês, dia da semana e o
 * travessão. Título fora do formato fica intacto, porque cortar por
 * aproximação comeria o começo de uma nota qualquer.
 */
export function tituloCurto(nome: string): string {
  const limpo = (nome ?? '').trim()
  const sem = limpo.replace(/^\d{1,2}\/\d{1,2}\s+\p{L}{3,}\.?\s*[—–-]\s*/u, '')
  // Se o corte esvaziar o título, o prefixo ERA o título (ex.: "08/11 dom").
  return sem === '' ? limpo : sem
}

/**
 * Acha a nota que um link `[[assim]]` aponta.
 *
 * Os links do vault usam o TÍTULO da nota, e o cardápio publica esse mesmo
 * título como `nome` — então o casamento é quase sempre direto. O "quase" é o
 * motivo desta função existir:
 *
 * - O título tem travessão e acento (`Física — Energia`), o nome do arquivo
 *   tem hífen e nenhum (`Fisica - Energia`), e um link pode ter sido escrito
 *   de qualquer um dos dois jeitos.
 * - Maiúscula e minúscula variam conforme quem escreveu.
 *
 * Por isso a comparação é por CHAVE: sem acento, sem caixa, com traços e
 * espaços repetidos reduzidos a um. Sem isso o link abria "a nota não existe"
 * em cima de uma nota que estava ali o tempo todo.
 */
export function chaveDoNome(nome: string): string {
  return (nome ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Travessão, meia-risca e hífen viram o mesmo caractere.
    .replace(/[\u2014\u2013-]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
}

export function acharPorNome<T extends { nome: string }>(
  itens: T[], alvo: string
): T | undefined {
  const chave = chaveDoNome(alvo)
  if (chave === '') return undefined
  const exato = itens.find(i => chaveDoNome(i.nome) === chave)
  if (exato) return exato
  // Última tentativa: o link cita só o começo do título, ou o título tem um
  // sufixo que o link não trouxe ("Fisica - Formulario Unicamp" x
  // "Fisica - Formulario").
  return itens.find(i => {
    const c = chaveDoNome(i.nome)
    return c.startsWith(chave) || chave.startsWith(c)
  })
}

/**
 * A ordem de estudo: hoje e o que vem primeiro; o passado, depois.
 *
 * É a mesma regra do Cortex no computador, e existe pelo mesmo motivo: a
 * lista de redações estava do mais novo para o mais velho, então a folha de
 * HOJE aparecia no fim, atrás de todas as de novembro. Quem abre a lista quer
 * agir, e agir é sempre no próximo.
 *
 * O passado desce em ordem decrescente, porque ali a lista vira consulta — e
 * consulta começa pelo mais recente. Item sem data vai para o fim, em vez de
 * se perder no meio.
 */
export function daquiPraFrente<T>(
  itens: T[], hoje: string, data: (i: T) => string
): T[] {
  const com = itens.filter(i => data(i) !== '')
  const sem = itens.filter(i => data(i) === '')
  const vindo = com.filter(i => data(i) >= hoje).sort((a, b) => data(a).localeCompare(data(b)))
  const passou = com.filter(i => data(i) < hoje).sort((a, b) => data(b).localeCompare(data(a)))
  return [...vindo, ...passou, ...sem]
}

/**
 * A aba vizinha, quando se arrasta o dedo de lado.
 *
 * Sem dar a volta de propósito: na primeira aba, arrastar para a direita não
 * faz nada. Dar a volta num gesto contínuo confunde — a pessoa não sabe se
 * avançou uma ou voltou duas.
 */
export function proximaAba<T>(abas: readonly T[], atual: T, passo: 1 | -1): T {
  const i = abas.indexOf(atual)
  if (i < 0) return atual
  const destino = i + passo
  if (destino < 0 || destino >= abas.length) return atual
  return abas[destino]
}

/**
 * A ordem de uma lista de tarefas com data: o que está ATRASADO vem primeiro.
 *
 * `daquiPraFrente` põe o passado no fim, e isso está certo para consulta —
 * mas errado para quem tem trabalho atrasado. A redação de ontem que não foi
 * escrita é a mais urgente da lista, e ela estava embaixo de todas as de
 * novembro.
 *
 * Três grupos, nesta ordem:
 *
 * 1. **Atrasado e não feito** — do mais antigo ao mais novo, para limpar a
 *    fila na ordem em que ela se formou.
 * 2. **Hoje e o futuro** — crescente. O próximo primeiro.
 * 3. **Já feito** — decrescente, porque ali a lista vira histórico.
 */
/**
 * Tira da lista o que já passou e não foi feito.
 *
 * A regra mudou a pedido dele: "as redações que já passaram, coloca como
 * atrasada e não coloca mais na lista pra aparecer ali. Se eu tiver um
 * tempo, eu faço".
 *
 * Antes as atrasadas lideravam a lista, e a intenção era boa — mas o efeito
 * na reta final é outro: abrir Redações e ver quatro cobranças de dias que
 * não voltam mais empurra a de HOJE para baixo da dobra. O que não foi feito
 * não some; muda de lugar, para um bloco à parte que ele abre quando tiver
 * fôlego.
 *
 * Feito é feito, mesmo atrasado: uma redação entregue com um dia de atraso
 * não é pendência, e por isso `feito` manda mais que a data.
 */
export function separarAtrasadas<T>(
  itens: T[], hoje: string, data: (i: T) => string, feito: (i: T) => boolean
): { lista: T[]; atrasadas: T[] } {
  const atrasadas = itens.filter(i => {
    const d = data(i)
    return d !== '' && d < hoje && !feito(i)
  })
  const fora = new Set(atrasadas)
  return { lista: itens.filter(i => !fora.has(i)), atrasadas }
}

export function ordemDeEstudo<T>(
  itens: T[], hoje: string, data: (i: T) => string, feito: (i: T) => boolean
): T[] {
  const cresc = (a: T, b: T): number => data(a).localeCompare(data(b))
  const desc = (a: T, b: T): number => data(b).localeCompare(data(a))

  const comData = itens.filter(i => data(i) !== '')
  const semData = itens.filter(i => data(i) === '')

  const atrasado = comData.filter(i => data(i) < hoje && !feito(i)).sort(cresc)
  const vindo = comData.filter(i => data(i) >= hoje && !feito(i)).sort(cresc)
  const pronto = comData.filter(i => feito(i)).sort(desc)

  return [...atrasado, ...vindo, ...pronto, ...semData]
}
