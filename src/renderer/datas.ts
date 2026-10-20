/**
 * Ordem e filtro por data, nas listas que têm data.
 *
 * Existe por um erro concreto: a lista de redações era `reverse()` — mais
 * recente primeiro —, o que estava certo enquanto redação só existia depois de
 * escrita. Quando as folhas passaram a ser criadas com antecedência, uma por
 * dia de redação, aquela ordem jogou a redação de HOJE para o fim da lista,
 * atrás de todas as de novembro.
 *
 * A regra certa, e que vale para prova, simulado, tarefa e redação: **hoje e o
 * que vem, crescente, primeiro; o que passou, decrescente, depois.** Quem abre
 * a lista quer agir, e agir é sempre no próximo. O passado é consulta, e
 * consulta começa pelo mais recente.
 *
 * Datas são comparadas como TEXTO, de propósito: o formato é sempre
 * `AAAA-MM-DD`, que ordena igual ao calendário, e construir `Date` aqui
 * traria fuso horário para dentro de uma conta que não precisa dele.
 */

type ComData = { date?: string | null }

const dia = (n: ComData): string => n.date ?? ''

/**
 * Hoje e o futuro primeiro, crescente; depois o passado, decrescente.
 *
 * Nota sem data vai para o fim: ela não é "futuro" nem "passado", e misturá-la
 * no meio faria a lista parecer desordenada.
 */
export function daquiPraFrente<T extends ComData>(notas: T[], hoje: string): T[] {
  const comData = notas.filter(n => dia(n) !== '')
  const semData = notas.filter(n => dia(n) === '')
  const vindo = comData.filter(n => dia(n) >= hoje).sort((a, b) => dia(a).localeCompare(dia(b)))
  const passou = comData.filter(n => dia(n) < hoje).sort((a, b) => dia(b).localeCompare(dia(a)))
  return [...vindo, ...passou, ...semData]
}

/** Soma dias a uma data ISO, devolvendo ISO. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  // `Date.UTC`, e não o construtor local: a conta é de calendário, e o
  // horário de verão de um fuso qualquer não tem o que dizer sobre "mais
  // sete dias".
  const t = new Date(Date.UTC(a, (m ?? 1) - 1, d ?? 1))
  t.setUTCDate(t.getUTCDate() + dias)
  const dois = (n: number): string => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${dois(t.getUTCMonth() + 1)}-${dois(t.getUTCDate())}`
}

export type Janela = 'afazer' | 'semana' | 'mes' | 'passados' | 'tudo'

/**
 * Os filtros oferecidos, na ordem em que aparecem na tela.
 *
 * `afazer` é o primeiro e o padrão: na reta final a pergunta é sempre "o que
 * falta". `tudo` fica por último porque é a saída de emergência, não o começo.
 */
export const JANELAS: { id: Janela; nome: string }[] = [
  { id: 'afazer', nome: 'A fazer' },
  { id: 'semana', nome: '7 dias' },
  { id: 'mes', nome: '30 dias' },
  { id: 'passados', nome: 'Passados' },
  { id: 'tudo', nome: 'Tudo' }
]

/**
 * Filtra pela janela escolhida.
 *
 * `semana` e `mes` começam HOJE e vão para a frente — não são os sete dias ao
 * redor. Quem filtra por "7 dias" na reta final quer saber o que cai nesta
 * semana, não o que caiu na passada.
 *
 * Nota sem data sobrevive a qualquer filtro: cortá-la faria desaparecer da
 * tela, sem aviso, o simulado que ainda não tem dia marcado.
 */
export function naJanela<T extends ComData>(notas: T[], hoje: string, j: Janela): T[] {
  if (j === 'tudo') return notas
  return notas.filter(n => {
    const d = dia(n)
    if (d === '') return true
    if (j === 'passados') return d < hoje
    if (j === 'afazer') return d >= hoje
    const limite = somarDias(hoje, j === 'semana' ? 7 : 30)
    return d >= hoje && d <= limite
  })
}

/** O filtro e a ordem juntos — é sempre assim que as telas usam os dois. */
export function listar<T extends ComData>(notas: T[], hoje: string, j: Janela): T[] {
  return daquiPraFrente(naJanela(notas, hoje, j), hoje)
}
