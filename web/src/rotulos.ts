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
