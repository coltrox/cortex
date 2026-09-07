/**
 * A regra de busca, compartilhada pelo Cortex e pelo celular.
 *
 * Mora em `shared/` porque as duas telas procuram a mesma coisa e a pessoa é
 * a mesma: digitar "unicamp" tem que achar o mesmo item nos dois lugares, na
 * mesma ordem. Duas implementações divergem — uma ganha acento, a outra não,
 * e aí o app parece quebrado num dos lados sem ninguém entender por quê.
 */

/**
 * Tira acento e caixa, para "redacao" achar "Redação".
 *
 * `NFD` separa a letra do acento, e `\p{Diacritic}` apaga o acento solto.
 * Sem isso, procurar sem acento — que é como se digita com pressa no celular
 * — não acharia nada do que foi escrito com acento.
 */
export const dobra = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Pontua um acerto contra uma lista ORDENADA de campos. Menor é melhor;
 * `null` é "não achou".
 *
 * Duas coisas decidem a nota, nesta ordem: QUAL campo bateu, e COMO bateu.
 * O primeiro campo da lista é o mais importante — normalmente o título —, e
 * dentro de cada campo o acerto exato ganha de "começa com", que ganha de
 * "contém". É a ordem em que a pessoa espera ver o que procurou: quem digita
 * "dentista" quer a consulta chamada Dentista antes de uma tarefa que
 * menciona dentista no meio da observação.
 *
 * O termo já deve vir dobrado por quem chama — `dobra` sobre a busca uma vez,
 * e não uma vez por item.
 */
export function pontuar(campos: (string | null | undefined)[], termo: string): number | null {
  if (termo === '') return null
  let melhor: number | null = null
  for (let i = 0; i < campos.length; i++) {
    const campo = campos[i]
    if (!campo) continue
    const c = dobra(campo)
    // O passo de 3 reserva as três formas de acerto dentro de cada campo, e
    // garante que qualquer acerto no campo 0 ganhe do melhor acerto no 1.
    const base = i * 3
    const nota = c === termo ? base
      : c.startsWith(termo) ? base + 1
        : c.includes(termo) ? base + 2
          : null
    if (nota !== null && (melhor === null || nota < melhor)) melhor = nota
  }
  return melhor
}
