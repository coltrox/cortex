/**
 * Datas que voltam todo ano.
 *
 * Um `evento` tem uma data e acontece uma vez. Aniversário, casamento e data
 * de falecimento não são isso: eles têm DIA e MÊS, e o ano só serve para
 * contar quantos anos faz. Guardar `date: '2026-09-27'` obrigaria a
 * recadastrar tudo em janeiro — e é exatamente o que uma usuária relatou
 * fazer à mão.
 *
 * Por isso a nota guarda `dia` e `mes`, e a próxima ocorrência é calculada.
 */

const dois = (n: number): string => String(n).padStart(2, '0')

/** A regra completa, e não só "divisível por 4": 1900 não foi bissexto. */
export function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

/** Quantos dias tem o mês. Fevereiro depende do ano. */
export function diasNoMes(mes: number, ano: number): number {
  if (mes === 2) return bissexto(ano) ? 29 : 28
  return [4, 6, 9, 11].includes(mes) ? 30 : 31
}

/**
 * A próxima vez que esta data cai, a partir de `hoje` (inclusive).
 *
 * Hoje conta como próxima: quem faz aniversário hoje quer ver hoje, não no
 * ano que vem.
 *
 * ## 29 de fevereiro
 *
 * Em ano comum não existe. Cai em 28 de fevereiro — e não em 1º de março —
 * porque quem nasceu em fevereiro comemora em fevereiro. É a leitura que
 * menos surpreende quem tem essa data na família.
 *
 * Devolve `null` para dia ou mês fora da faixa: `31/02` não é uma data, e
 * inventar 3 de março para ela seria pior do que não mostrar nada.
 */
export function proximaOcorrencia(dia: number, mes: number, hoje: string): string | null {
  if (!Number.isInteger(dia) || !Number.isInteger(mes)) return null
  if (mes < 1 || mes > 12 || dia < 1) return null
  // A checagem usa um ano bissexto para não recusar 29/02 na entrada — ela é
  // uma data legítima, só não existe todo ano.
  if (dia > diasNoMes(mes, 2024)) return null

  const anoHoje = Number(hoje.slice(0, 4))
  if (!Number.isInteger(anoHoje)) return null

  for (const ano of [anoHoje, anoHoje + 1]) {
    const d = Math.min(dia, diasNoMes(mes, ano))
    const iso = `${ano}-${dois(mes)}-${dois(d)}`
    if (iso >= hoje) return iso
  }
  return null
}

/**
 * Quantos anos a data completa numa ocorrência — `null` sem ano de origem.
 *
 * Serve para "faz 18 anos" e para "há 3 anos", que é o mesmo número com
 * outra leitura: o tipo da data comemorativa é que decide como se lê.
 */
export function anosCompletados(anoOrigem: unknown, ocorrencia: string): number | null {
  if (typeof anoOrigem !== 'number' || !Number.isInteger(anoOrigem)) return null
  // Um ano de quatro dígitos plausível. `19` ou `20260` viraria uma conta sem
  // sentido na tela, e o campo é digitado à mão.
  if (anoOrigem < 1900 || anoOrigem > 2200) return null
  const anos = Number(ocorrencia.slice(0, 4)) - anoOrigem
  return anos >= 0 ? anos : null
}

/**
 * O ano digitado, se ele puder ser o de quando a data começou.
 *
 * O campo do celular é uma data inteira e já nasce com o ano corrente. Quem
 * não sabe o ano deixa o que veio — e contar isso anunciaria "faz 0 anos".
 * Por isso só vale um ano ANTERIOR ao corrente. A mesma regra na criação, na
 * edição e na cópia local do celular: cada uma com a sua, elas divergiriam.
 */
export function anoDeOrigem(ano: number, hoje: string): number | undefined {
  return Number.isInteger(ano) && ano >= 1900 && ano < Number(hoje.slice(0, 4))
    ? ano
    : undefined
}
