/**
 * Sugerir caminho enquanto se digita `./` no editor.
 *
 * Pedido do dono: "quando eu for digitar ./ ir aparecendo o caminho, pra
 * ajudar a selecionar a pasta". Isto aqui é só a parte que mexe em texto —
 * achar o pedaço de caminho debaixo do cursor e decidir o que ele vira quando
 * a pessoa escolhe um nome. Quem lê a pasta de verdade é a lente Dev.
 */

export type TrechoDeCaminho = {
  /** Onde o caminho começa no texto (para trocar só ele). */
  inicio: number
  /** O caminho inteiro escrito até o cursor: `./src/comp`. */
  texto: string
  /** A pasta já fechada por uma barra: `./src/`. */
  pasta: string
  /** O que foi digitado depois da última barra: `comp`. */
  parcial: string
}

/**
 * O caminho relativo debaixo do cursor, ou `null`.
 *
 * Começa em `./` ou `../` e vai até o cursor. Para nas aspas, nos parênteses
 * e no espaço — o que delimita um caminho dentro de um `import`, de um `src=`
 * ou de uma linha de terminal.
 */
export function trechoDeCaminho(texto: string, cursor: number): TrechoDeCaminho | null {
  const antes = texto.slice(0, cursor)
  const m = /(\.{1,2}(?:\/[^\s"'`()<>|*?]*)+\/?|\.{1,2}\/)$/.exec(antes)
  if (!m) return null
  const encontrado = m[1]
  // Uma linha de texto pode ter "./" no meio de uma frase, e `this.props./`
  // é chamada de método: exigir que o caractere anterior não seja letra nem
  // ponto evita sugerir onde não há caminho nenhum.
  const anterior = antes[antes.length - encontrado.length - 1]
  if (anterior && /[\w.]/.test(anterior)) return null

  const corte = encontrado.lastIndexOf('/')
  return {
    inicio: antes.length - encontrado.length,
    texto: encontrado,
    pasta: encontrado.slice(0, corte + 1),
    parcial: encontrado.slice(corte + 1)
  }
}

/**
 * Os nomes que combinam com o que já foi digitado.
 *
 * Sem acento e sem caixa: quem digita `ed` acha `Editor.tsx`. Pasta primeiro,
 * porque escolher pasta é o passo do meio — e é o que o pedido descreve.
 */
export function filtrarSugestoes(
  nomes: { nome: string; pasta: boolean }[], parcial: string, limite = 8
): { nome: string; pasta: boolean }[] {
  const chave = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const p = chave(parcial)
  return nomes
    .filter(n => chave(n.nome).startsWith(p))
    .sort((a, b) => (Number(b.pasta) - Number(a.pasta)) || a.nome.localeCompare(b.nome))
    .slice(0, limite)
}

/**
 * O texto depois de escolher um nome: a parcial some, o nome entra, e pasta
 * termina em barra — para a sugestão seguinte já ser a de dentro dela.
 */
export function aplicarSugestao(
  texto: string, trecho: TrechoDeCaminho, escolha: { nome: string; pasta: boolean }
): { texto: string; cursor: number } {
  const novo = trecho.pasta + escolha.nome + (escolha.pasta ? '/' : '')
  const fim = trecho.inicio + trecho.texto.length
  return {
    texto: texto.slice(0, trecho.inicio) + novo + texto.slice(fim),
    cursor: trecho.inicio + novo.length
  }
}

/**
 * A pasta que o trecho aponta, em caminho do projeto.
 *
 * `base` é a pasta do arquivo aberto (relativa à raiz), e `rel` o que se
 * digitou (`./`, `../src/`). Subir além da raiz não sai da raiz: a lente Dev
 * só enxerga o que está autorizado, e devolver `..` daria erro em vez de
 * sugestão.
 */
export function resolverRelativo(base: string, rel: string): string {
  const partes = base ? base.split('/') : []
  for (const p of rel.split('/')) {
    if (p === '' || p === '.') continue
    if (p === '..') partes.pop()
    else partes.push(p)
  }
  return partes.join('/')
}
