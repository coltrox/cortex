/**
 * O markdown do celular.
 *
 * Existe porque a tela de Estudar mostrava o corpo da nota num `<pre>`, como
 * texto cru. Enquanto as notas eram listas curtas, dava para viver com isso.
 * Com os conteúdos novos — que têm título, tabela, fórmula e negrito — a tela
 * virou uma parede de `##`, `**` e `|`, ilegível justamente no aparelho em
 * que ele vai estudar fora de casa.
 *
 * É um subconjunto deliberado: título, parágrafo, lista, tarefa, citação,
 * tabela, fórmula, regra e código. Não há imagem, nota de rodapé nem HTML
 * embutido, porque nada disso aparece nas notas do vault — e cada regra a
 * mais é uma regra a mais para errar.
 *
 * O desktop tem o renderizador dele em `src/renderer/components/Markdown.tsx`,
 * com fórmula desenhada de verdade. Não dá para reusar aqui: ele depende do
 * CSS daquele app. O que este faz com fórmula é mostrá-la em monoespaçado,
 * limpa dos comandos — melhor que LaTeX cru, e honesto sobre o que é.
 */

export type Bloco =
  | { tipo: 'titulo'; nivel: number; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; itens: string[]; numerada: boolean }
  | { tipo: 'tarefa'; itens: { texto: string; feito: boolean }[] }
  | { tipo: 'citacao'; texto: string }
  /**
   * `texto` é a versão legível, para quem só quer mostrar uma linha.
   * `cru` guarda o LaTeX como está na nota, porque a fração precisa dele:
   * depois de virar `(a)/(b)` não dá mais para empilhar numerador e
   * denominador.
   */
  | { tipo: 'formula'; texto: string; cru: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] }
  | { tipo: 'regra' }

/** Uma linha de tabela markdown vira células, sem os pipes das pontas. */
function celulas(linha: string): string[] {
  return linha.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
}

const separadorDeTabela = (l: string): boolean =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-')

/**
 * Limpa os comandos de LaTeX que o celular não desenha.
 *
 * `\text{...}` vira o conteúdo, `\frac{a}{b}` vira `(a)/(b)`, e os comandos
 * conhecidos viram o símbolo. O que sobrar aparece como está — é melhor
 * mostrar `\oint` do que apagar um pedaço da fórmula sem avisar.
 */
/**
 * Expoente e índice viram caractere de verdade.
 *
 * `v^2` aparecia como `v^2` na tela e `E_c` como `E_c`, com o sublinhado cru
 * no meio da fórmula. Unicode tem os dois conjuntos, e usá-los é a diferença
 * entre uma fórmula e um pedaço de código-fonte.
 *
 * O que não existe em Unicode fica como está — melhor um `_β` honesto do que
 * um caractere parecido que muda o sentido.
 */
const ALTO: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ'
}
const BAIXO: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  a: 'ₐ', e: 'ₑ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ',
  o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ'
}

function trocarIndices(s: string): string {
  const mapear = (txt: string, tabela: Record<string, string>): string | null => {
    let saida = ''
    for (const c of txt) {
      const t = tabela[c]
      if (!t) return null
      saida += t
    }
    return saida
  }
  return s
    .replace(/\^\{([^}]+)\}|\^(\w)/g, (inteiro, chaves, solto) =>
      mapear(chaves ?? solto, ALTO) ?? inteiro)
    .replace(/_\{([^}]+)\}|_(\w)/g, (inteiro, chaves, solto) =>
      mapear(chaves ?? solto, BAIXO) ?? inteiro)
}

export type PedacoFormula =
  | { tipo: 'texto'; texto: string }
  /** Numerador sobre denominador, com a barra desenhada pelo CSS. */
  | { tipo: 'fracao'; cima: string; baixo: string }
  /**
   * Índice que o Unicode não tem.
   *
   * Existe subscrito para `p` (Eₚ) e não para `c` — e `E_c`, com o sublinhado
   * à mostra, é exatamente o que ele apontou na foto. Este pedaço deixa a
   * tela resolver com `<sub>`, que serve para qualquer letra.
   */
  | { tipo: 'sub'; texto: string }

/**
 * A fórmula partida em pedaços que a tela sabe desenhar.
 *
 * Nasceu de uma comparação que ele mandou: no Cortex a fração aparece
 * empilhada, e no celular virava `E_c = (m v^2)/(2) E_p = m g h` — tudo numa
 * linha, com barra e parêntese no lugar do traço de fração.
 *
 * Duas fórmulas na mesma linha também vinham coladas. `\qquad` e `\quad` são
 * justamente o espaço largo do LaTeX, então viram SEPARADOR aqui: cada
 * fórmula ganha a sua caixa.
 */
export function partesDaFormula(texto: string): PedacoFormula[][] {
  const formulas = texto.split(/\\qquad|\\quad|\s{3,}/).filter(f => f.trim() !== '')
  return formulas.map(f => {
    const pedacos: PedacoFormula[] = []
    let resto = f
    const re = /\\frac\{([^{}]*)\}\{([^{}]*)\}/
    let achado = re.exec(resto)
    while (achado) {
      const antes = resto.slice(0, achado.index)
      if (antes.trim()) pedacos.push({ tipo: 'texto', texto: formulaLegivel(antes) })
      pedacos.push({
        tipo: 'fracao',
        cima: formulaLegivel(achado[1] ?? ''),
        baixo: formulaLegivel(achado[2] ?? '')
      })
      resto = resto.slice(achado.index + achado[0].length)
      achado = re.exec(resto)
    }
    if (resto.trim()) pedacos.push({ tipo: 'texto', texto: formulaLegivel(resto) })
    return pedacos.flatMap(separarIndices)
  })
}

/**
 * Quebra um pedaço de texto onde sobrou um `_x` sem subscrito Unicode.
 *
 * Fração e sub já resolvidos passam direto. O que chega aqui é o texto que
 * `formulaLegivel` não conseguiu converter inteiro — `E_c` é o caso da foto.
 */
function separarIndices(p: PedacoFormula): PedacoFormula[] {
  if (p.tipo !== 'texto' || !p.texto.includes('_')) return [p]
  const out: PedacoFormula[] = []
  let resto = p.texto
  const re = /_\{?([^{}\s_]+)\}?/
  let achado = re.exec(resto)
  while (achado) {
    const antes = resto.slice(0, achado.index)
    if (antes) out.push({ tipo: 'texto', texto: antes })
    out.push({ tipo: 'sub', texto: achado[1] ?? '' })
    resto = resto.slice(achado.index + achado[0].length)
    achado = re.exec(resto)
  }
  if (resto) out.push({ tipo: 'texto', texto: resto })
  return out
}

export function formulaLegivel(texto: string): string {
  const simbolos: Record<string, string> = {
    times: '×', cdot: '·', div: '÷', pm: '±', neq: '≠', leq: '≤', geq: '≥',
    le: '≤', ge: '≥', approx: '≈', infty: '∞', rightarrow: '→', to: '→',
    Delta: 'Δ', alpha: 'α', beta: 'β', gamma: 'γ', theta: 'θ', lambda: 'λ',
    mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω',
    eta: 'η', quad: '  ', qquad: '    '
  }
  return texto
    /* `\%`, `\$`, `\&`: no LaTeX a contra-barra só escapa o caractere, que em
       si não é comando. Sem esta linha ela sobrava na tela — "taxa de 1,2\%"
       era o que aparecia na questão, porque a troca de comandos abaixo só
       casa letras e deixava a contra-barra para trás. */
    .replace(/\\([%$&_#])/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\([a-zA-Z]+)/g, (inteiro: string, nome: string) => simbolos[nome] ?? inteiro)
    /* Índice e expoente ANTES de tirar as chaves: `^{12}` precisa das chaves
       para saber que os dois dígitos sobem juntos. */
    .replace(/[{}]/g, m => m)
    .replace(/(\^|_)\{?[^{}\s]*\}?/g, m => trocarIndices(m))
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Quebra o texto da nota em blocos.
 *
 * Varre linha a linha, e não por expressão regular sobre o texto inteiro:
 * tabela e bloco de fórmula dependem de onde a linha está, e regex multilinha
 * para isso fica ilegível na primeira correção.
 */
export function blocos(texto: string): Bloco[] {
  const linhas = (texto ?? '').replace(/\r\n/g, '\n').split('\n')
  const out: Bloco[] = []
  let i = 0

  const paragrafo: string[] = []
  const fecharParagrafo = (): void => {
    if (paragrafo.length === 0) return
    out.push({ tipo: 'paragrafo', texto: paragrafo.join(' ').trim() })
    paragrafo.length = 0
  }

  while (i < linhas.length) {
    const l = linhas[i]

    if (l.trim() === '') { fecharParagrafo(); i++; continue }

    // Fórmula: `$$` sozinho abre e fecha, como no Cortex do computador.
    if (l.trim() === '$$') {
      fecharParagrafo()
      const corpo: string[] = []
      i++
      while (i < linhas.length && linhas[i].trim() !== '$$') { corpo.push(linhas[i]); i++ }
      i++
      const cru = corpo.join(' ')
      out.push({ tipo: 'formula', texto: formulaLegivel(cru), cru })
      continue
    }

    if (/^```/.test(l.trim())) {
      fecharParagrafo()
      const corpo: string[] = []
      i++
      while (i < linhas.length && !/^```/.test(linhas[i].trim())) { corpo.push(linhas[i]); i++ }
      i++
      out.push({ tipo: 'codigo', texto: corpo.join('\n') })
      continue
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(l)
    if (titulo) {
      fecharParagrafo()
      out.push({ tipo: 'titulo', nivel: titulo[1].length, texto: titulo[2].trim() })
      i++
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) {
      fecharParagrafo()
      out.push({ tipo: 'regra' })
      i++
      continue
    }

    // Tabela: a linha tem pipes e a de baixo é o separador.
    if (l.includes('|') && i + 1 < linhas.length && separadorDeTabela(linhas[i + 1])) {
      fecharParagrafo()
      const cabecalho = celulas(l)
      i += 2
      const corpo: string[][] = []
      while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim() !== '') {
        corpo.push(celulas(linhas[i]))
        i++
      }
      out.push({ tipo: 'tabela', cabecalho, linhas: corpo })
      continue
    }

    // Tarefas antes da lista comum: `- [ ]` também começa com hífen.
    if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(l)) {
      fecharParagrafo()
      const itens: { texto: string; feito: boolean }[] = []
      while (i < linhas.length && /^\s*[-*]\s+\[[ xX]\]\s+/.test(linhas[i])) {
        const m = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(linhas[i])
        if (m) itens.push({ texto: m[2].trim(), feito: m[1].toLowerCase() === 'x' })
        i++
      }
      out.push({ tipo: 'tarefa', itens })
      continue
    }

    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      fecharParagrafo()
      const numerada = /^\s*\d+[.)]\s+/.test(l)
      const itens: string[] = []
      while (i < linhas.length) {
        const atual = linhas[i]
        const casa = numerada
          ? /^\s*\d+[.)]\s+(.*)$/.exec(atual)
          : /^\s*[-*]\s+(.*)$/.exec(atual)
        if (casa) { itens.push(casa[1].trim()); i++; continue }
        // Continuação indentada entra no item anterior, em vez de virar
        // parágrafo solto no meio da lista.
        if (/^\s{2,}\S/.test(atual) && itens.length > 0) {
          itens[itens.length - 1] += ' ' + atual.trim()
          i++
          continue
        }
        break
      }
      out.push({ tipo: 'lista', itens, numerada })
      continue
    }

    if (/^\s*>\s?/.test(l)) {
      fecharParagrafo()
      const corpo: string[] = []
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) {
        corpo.push(linhas[i].replace(/^\s*>\s?/, ''))
        i++
      }
      out.push({ tipo: 'citacao', texto: corpo.join(' ').trim() })
      continue
    }

    paragrafo.push(l.trim())
    i++
  }

  fecharParagrafo()
  return out
}

export type Pedaco =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'forte'; texto: string }
  | { tipo: 'enfase'; texto: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'formula'; texto: string }
  | { tipo: 'link'; texto: string }

/**
 * Quebra uma linha nos trechos formatados.
 *
 * A ordem do padrão importa: `**forte**` precisa vir antes de `*ênfase*`,
 * senão o primeiro asterisco fecha sozinho e o negrito vira itálico torto.
 */
export function pedacos(linha: string): Pedaco[] {
  const padrao = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)|(\$[^$\n]+\$)|(\[\[[^\]\n]+\]\])/
  const out: Pedaco[] = []
  let resto = linha ?? ''

  while (resto.length > 0) {
    const m = padrao.exec(resto)
    if (!m) { out.push({ tipo: 'texto', texto: resto }); break }
    if (m.index > 0) out.push({ tipo: 'texto', texto: resto.slice(0, m.index) })
    const t = m[0]
    if (t.startsWith('**')) out.push({ tipo: 'forte', texto: t.slice(2, -2) })
    else if (t.startsWith('`')) out.push({ tipo: 'codigo', texto: t.slice(1, -1) })
    else if (t.startsWith('$')) out.push({ tipo: 'formula', texto: formulaLegivel(t.slice(1, -1)) })
    else if (t.startsWith('[[')) out.push({ tipo: 'link', texto: t.slice(2, -2) })
    else out.push({ tipo: 'enfase', texto: t.slice(1, -1) })
    resto = resto.slice(m.index + t.length)
  }

  return out.filter(p => p.texto !== '')
}
