/**
 * O histórico de exercícios de uma nota de conteúdo.
 *
 * Antes a nota guardava só `acertos` e `total`, e a tela dizia "na última vez:
 * 14/20". Pedido dele, ao pé da letra: "quero guardar também os exercícios
 * feitos de cada conteúdo do cronograma, a quantidade que eu acertei SEM
 * SUMIR, e se eu errei também as observações".
 *
 * Por isso o histórico é acumulado, e cada tentativa carrega QUAIS questões
 * erraram — é o que permite refazer só aquelas depois.
 *
 * Guardado como LISTA DE TEXTO, e não como lista de objetos, por um motivo
 * prático: o frontmatter é lido por olho humano no arquivo e desenhado pela
 * tela de campos, que já sabe mostrar lista de texto. Objeto aninhado
 * apareceria como `[object Object]` em qualquer lugar que ainda não o conheça.
 */

export type Tentativa = {
  /** Dia da tentativa, em ISO (`2026-10-27`). */
  data: string
  acertos: number
  total: number
  /** Minutos gastos. Zero quando não houve cronômetro. */
  minutos?: number
  /** Números das questões erradas, na ordem em que aparecem na nota. */
  erradas?: number[]
}

/**
 * Teto do histórico.
 *
 * Vinte tentativas por conteúdo é mais do que ele vai refazer até a prova, e
 * sem teto o frontmatter cresceria para sempre — a nota é lida inteira a cada
 * abertura.
 */
const TETO = 20

/** Uma linha legível, do jeito que aparece no arquivo e na tela. */
export function linhaDaTentativa(t: Tentativa): string {
  const partes = [t.data, `${t.acertos}/${t.total}`]
  if (t.minutos && t.minutos > 0) partes.push(`${t.minutos} min`)
  /* "errou 3, 7, 9" em vez de só a contagem: a observação que ele pediu é
     saber EM QUAIS questões errou, para refazer essas. */
  if (t.erradas && t.erradas.length > 0) partes.push(`errou ${t.erradas.join(', ')}`)
  else if (t.acertos === t.total) partes.push('tudo certo')
  return partes.join(' · ')
}

/** Só o que já era lista de texto; o resto do campo é ignorado em silêncio. */
function anterioresValidas(campo: unknown): string[] {
  if (Array.isArray(campo)) return campo.filter((x): x is string => typeof x === 'string')
  /* Campo com uma string só é o caso de quem editou a nota à mão. */
  if (typeof campo === 'string' && campo.trim() !== '') return [campo]
  return []
}

/**
 * Acrescenta a tentativa nova ao histórico, do mais recente para o mais antigo.
 *
 * A mais nova vem PRIMEIRO porque é a que importa ao abrir a nota, e a lista
 * costuma ser lida só de relance.
 */
export function registrarTentativa(campoAtual: unknown, nova: Tentativa): string[] {
  return [linhaDaTentativa(nova), ...anterioresValidas(campoAtual)].slice(0, TETO)
}
