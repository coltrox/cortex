/** Mais que isto não vira marca na tela: num arquivo gerado, marcar tudo travaria a digitação. */
export const MAX_OCORRENCIAS = 2000

/**
 * Onde `termo` aparece em `texto` — as posições de início, sem sobrepor e sem
 * diferenciar maiúscula de minúscula, como o Ctrl+F do VS Code por padrão.
 */
export function ocorrencias(texto: string, termo: string): number[] {
  if (!termo) return []
  const t = texto.toLowerCase()
  const q = termo.toLowerCase()
  const achados: number[] = []
  for (let i = t.indexOf(q); i !== -1 && achados.length < MAX_OCORRENCIAS; i = t.indexOf(q, i + q.length)) {
    achados.push(i)
  }
  return achados
}

/** A linha e a coluna (a partir de 0) de uma posição do texto — é o que diz para onde rolar. */
export function linhaEColuna(texto: string, pos: number): { linha: number; coluna: number } {
  const antes = texto.slice(0, pos)
  const quebra = antes.lastIndexOf('\n')
  return { linha: antes.split('\n').length - 1, coluna: pos - quebra - 1 }
}
