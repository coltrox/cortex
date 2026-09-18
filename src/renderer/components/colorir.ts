/**
 * A cor do código no editor do Dev, no estilo do tema Min do VS Code.
 *
 * Um colorizador pequeno e feito aqui, e não Prism, Shiki ou CodeMirror: eles
 * trazem gramáticas de centenas de linguagens para acertar casos que não
 * importam num editor de consulta rápida. Este acerta o que o olho procura —
 * palavra-chave, texto, número, comentário, função, tipo, tag — com uma
 * expressão só por linguagem. Errar um caso raro custa uma cor errada, nunca
 * o texto: os pedaços sempre juntam de volta no original.
 */

export type Cor = 'chave' | 'str' | 'num' | 'com' | 'fun' | 'tipo' | 'const' | 'tag' | 'prop'
export type Pedaco = { t: Cor | null; s: string }

/** Acima disto (package-lock.json, arquivo gerado) o texto fica sem cor: colorir travaria a digitação. */
export const LIMITE_COLORIR = 300_000

const conjunto = (s: string): Set<string> => new Set(s.split(' '))

/** Comentário de linha com `//` e de bloco com `/* *\/`. */
const BARRA = conjunto('ts tsx js jsx mjs cjs mts cts java kt kts c h cpp hpp cc cs go rs php swift dart scss less json jsonc vue svelte')
const SO_BLOCO = conjunto('css')
const CERQUILHA = conjunto('py sh bash zsh rb yaml yml toml ps1 r env conf ini dockerfile makefile')
const HTML = conjunto('html htm xml svg vue svelte')
const TAGS = conjunto('tsx jsx html htm xml svg vue svelte')
const CRASE = conjunto('ts tsx js jsx mjs cjs mts cts vue svelte')
/** Texto corrido: colorir palavra-chave no meio de uma frase só atrapalha. */
const SEM_COR = conjunto('md markdown txt log csv')

const CHAVES = conjunto(
  'import export from default const let var function return if else for while do switch case break ' +
  'continue new class extends implements interface type enum async await try catch finally throw typeof ' +
  'instanceof in of as this super public private protected static readonly abstract override declare ' +
  'void yield delete get set def lambda pass elif with not and or is raise except global nonlocal ' +
  'package func go defer chan map struct range select fallthrough fn mut impl trait pub use mod match ' +
  'loop where self Self crate unsafe dyn move ref namespace using val fun object when final sealed ' +
  'include define require end then unless elsif module begin rescue ensure echo'
)
const CONSTANTES = conjunto('true false null undefined None True False nil NaN Infinity')

const PADROES = new Map<string, RegExp>()

/** A expressão de uma extensão, montada uma vez e guardada. */
function padraoDe(ext: string): RegExp {
  const pronto = PADROES.get(ext)
  if (pronto) return pronto

  const com: string[] = []
  if (BARRA.has(ext)) com.push('\\/\\/[^\\n]*')
  if (BARRA.has(ext) || SO_BLOCO.has(ext)) com.push('\\/\\*[\\s\\S]*?(?:\\*\\/|$)')
  if (CERQUILHA.has(ext)) com.push('#[^\\n]*')
  if (HTML.has(ext)) com.push('<!--[\\s\\S]*?(?:-->|$)')

  const str = ['"(?:[^"\\\\\\n]|\\\\.)*"?', "'(?:[^'\\\\\\n]|\\\\.)*'?"]
  if (CRASE.has(ext)) str.push('`(?:[^`\\\\]|\\\\[\\s\\S])*`?')

  const partes = [
    com.length ? `(?<com>${com.join('|')})` : '',
    `(?<str>${str.join('|')})`,
    '(?<num>\\b0[xX][\\da-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)',
    // Um `<` colado numa palavra ou num fecha-parêntese é "menor que", não tag.
    TAGS.has(ext) ? '(?<tag>(?<![\\w$)\\]])<\\/?[A-Za-z][\\w.:-]*)' : '',
    '(?<fun>[A-Za-z_$][\\w$]*(?=\\s*\\())',
    '(?<pal>[A-Za-z_$][\\w$]*)',
    '(?<outro>\\s+|[^\\sA-Za-z_$\\d"\'`/#<]+|[\\s\\S])'
  ].filter(Boolean)

  const re = new RegExp(partes.join('|'), 'g')
  PADROES.set(ext, re)
  return re
}

/** O texto em pedaços com a sua cor (ou sem cor). Juntos, dão o texto original. */
export function colorir(texto: string, ext: string): Pedaco[] {
  const e = ext.toLowerCase()
  if (SEM_COR.has(e) || texto.length > LIMITE_COLORIR) return [{ t: null, s: texto }]

  const re = padraoDe(e)
  re.lastIndex = 0
  const saida: Pedaco[] = []
  const por = (t: Cor | null, s: string): void => {
    const ultimo = saida[saida.length - 1]
    if (t === null && ultimo && ultimo.t === null) ultimo.s += s
    else saida.push({ t, s })
  }

  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const g = m.groups ?? {}
    const s = m[0]
    if (g.com !== undefined) por('com', s)
    else if (g.str !== undefined) {
      // Em JSON, texto seguido de dois-pontos é o nome do campo.
      const campo = e.startsWith('json') && /^\s*:/.test(texto.slice(re.lastIndex, re.lastIndex + 40))
      por(campo ? 'prop' : 'str', s)
    } else if (g.num !== undefined) por('num', s)
    else if (g.tag !== undefined) por('tag', s)
    else if (g.fun !== undefined) por(CHAVES.has(s) ? 'chave' : 'fun', s)
    else if (g.pal !== undefined) {
      if (CHAVES.has(s)) por('chave', s)
      else if (CONSTANTES.has(s)) por('const', s)
      else if (/^[A-Z]/.test(s)) por('tipo', s)
      else por(null, s)
    } else por(null, s)
  }
  return saida
}
