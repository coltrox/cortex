import { Fragment, type ReactNode } from 'react'

/**
 * Renderizador de markdown do Cortex.
 *
 * Escrito à mão, sem biblioteca, por dois motivos que valem mais que a
 * conveniência: (1) precisa entender `[[wikilink]]`, que nenhum parser padrão
 * conhece, e (2) tudo vira elemento React — nunca `innerHTML`. O conteúdo é
 * do próprio autor, mas uma nota também pode chegar de um arquivo copiado de
 * qualquer lugar, e transformar texto de arquivo em HTML executável é
 * exatamente a porta que o resto do app fecha em todas as outras camadas.
 *
 * As fórmulas são renderizadas por `Formula`, um formatador leve — não é
 * LaTeX completo, é o subconjunto que cai numa prova: fração, potência,
 * índice, raiz, gregas e os operadores comuns. A alternativa era embutir uma
 * biblioteca com sessenta arquivos de fonte para desenhar um delta.
 */

/* ---------- fórmulas ---------- */

const GREGAS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
}

const SIMBOLOS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', neq: '≠', leq: '≤',
  geq: '≥', approx: '≈', equiv: '≡', propto: '∝', infty: '∞', in: '∈',
  notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀',
  exists: '∃', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', to: '→', sum: '∑', prod: '∏', int: '∫', partial: '∂',
  nabla: '∇', angle: '∠', degree: '°', therefore: '∴', ldots: '…',
  emptyset: '∅', log: 'log', ln: 'ln', sen: 'sen', sin: 'sen',
  cos: 'cos', tan: 'tg', tg: 'tg', lim: 'lim', max: 'max', min: 'min'
}

/**
 * Contra-barra montada por código de caractere — o mesmo motivo do
 * `BARRA_INVERTIDA` em `shared/ipc.ts`: escrever o literal escapado dentro de
 * uma string aqui é a fonte de erro mais boba possível neste arquivo.
 */
const CONTRA_BARRA = String.fromCharCode(92)

/** Lê `{...}` equilibrado a partir de `i` (que aponta para a chave de abertura). */
function grupo(s: string, i: number): { corpo: string; fim: number } {
  if (s[i] !== '{') return { corpo: s[i] ?? '', fim: i + 1 }
  let nivel = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') nivel++
    else if (s[j] === '}') {
      nivel--
      if (nivel === 0) return { corpo: s.slice(i + 1, j), fim: j + 1 }
    }
  }
  return { corpo: s.slice(i + 1), fim: s.length }
}

/** Converte uma expressão em elementos. Recursivo — frações aninham. */
function expressao(src: string, chave = 'f'): ReactNode[] {
  const out: ReactNode[] = []
  let texto = ''
  let i = 0
  let n = 0

  const descarrega = (): void => {
    if (texto) { out.push(<Fragment key={`t${n++}`}>{texto}</Fragment>); texto = '' }
  }

  while (i < src.length) {
    const c = src[i]

    if (c === CONTRA_BARRA) {
      // O `.` inicial casa com a própria contra-barra, que a linha acima já
      // confirmou estar ali — evita escrevê-la escapada dentro do regex.
      const m = /^.([A-Za-z]+)/.exec(src.slice(i))
      if (!m) { texto += c; i++; continue }
      const nome = m[1]
      i += m[0].length

      if (nome === 'frac' || nome === 'dfrac') {
        const a = grupo(src, i); const b = grupo(src, a.fim)
        i = b.fim
        descarrega()
        out.push(
          <span className="frac" key={`${chave}${n++}`}>
            <span className="frac-cima">{expressao(a.corpo, `${chave}a`)}</span>
            <span className="frac-baixo">{expressao(b.corpo, `${chave}b`)}</span>
          </span>
        )
        continue
      }
      if (nome === 'sqrt') {
        const a = grupo(src, i)
        i = a.fim
        descarrega()
        out.push(
          <span className="raiz" key={`${chave}${n++}`}>
            <span className="raiz-sinal">√</span>
            <span className="raiz-corpo">{expressao(a.corpo, `${chave}r`)}</span>
          </span>
        )
        continue
      }
      if (nome === 'text' || nome === 'mathrm') {
        const a = grupo(src, i)
        i = a.fim
        descarrega()
        out.push(<span className="mtexto" key={`${chave}${n++}`}>{a.corpo}</span>)
        continue
      }
      texto += GREGAS[nome] ?? SIMBOLOS[nome] ?? nome
      continue
    }

    if (c === '^' || c === '_') {
      const a = grupo(src, i + 1)
      i = a.fim
      descarrega()
      const Tag = c === '^' ? 'sup' : 'sub'
      out.push(<Tag key={`${chave}${n++}`}>{expressao(a.corpo, `${chave}s`)}</Tag>)
      continue
    }

    if (c === '{' || c === '}') { i++; continue }

    texto += c
    i++
  }

  descarrega()
  return out
}

export function Formula({ src, bloco }: { src: string; bloco?: boolean }) {
  return <span className={bloco ? 'formula bloco' : 'formula'}>{expressao(src)}</span>
}

/* ---------- inline ---------- */

type AoAbrirLink = (alvo: string) => void

/**
 * Marcações inline, em uma passada só.
 *
 * A ordem importa: `$…$` e crase são fechados antes de negrito e itálico,
 * senão um `*` dentro de uma fórmula viraria ênfase e comeria a expressão.
 */
function inline(texto: string, aoAbrirLink?: AoAbrirLink, chave = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let resto = texto
  let n = 0

  const padrao = /(\$[^$\n]+\$)|(`[^`\n]+`)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]*\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(==[^=\n]+==)|(\*[^*\n]+\*)|(~~[^~\n]+~~)/

  while (resto) {
    const m = padrao.exec(resto)
    if (!m) { out.push(resto); break }
    if (m.index > 0) out.push(resto.slice(0, m.index))
    const t = m[0]
    const k = `${chave}${n++}`

    if (t.startsWith('$')) {
      out.push(<Formula key={k} src={t.slice(1, -1)} />)
    } else if (t.startsWith('`')) {
      out.push(<code key={k}>{t.slice(1, -1)}</code>)
    } else if (t.startsWith('[[')) {
      const alvo = t.slice(2, -2)
      const [destino, rotulo] = alvo.split('|')
      out.push(
        <button
          key={k}
          className="wikilink"
          onClick={() => aoAbrirLink?.(destino.trim())}
          disabled={!aoAbrirLink}
        >
          {(rotulo ?? destino).trim()}
        </button>
      )
    } else if (t.startsWith('[')) {
      const corte = t.indexOf('](')
      const rotulo = t.slice(1, corte)
      const url = t.slice(corte + 2, -1)
      // Só http(s) vira link clicável. `javascript:` num arquivo de texto é a
      // porta clássica; aqui ela simplesmente não abre.
      out.push(/^https?:\/\//.test(url)
        ? <a key={k} href={url} target="_blank" rel="noreferrer">{rotulo || url}</a>
        : <span key={k}>{rotulo || url}</span>)
    } else if (t.startsWith('**')) {
      out.push(<strong key={k}>{inline(t.slice(2, -2), aoAbrirLink, k)}</strong>)
    } else if (t.startsWith('==')) {
      out.push(<mark key={k}>{inline(t.slice(2, -2), aoAbrirLink, k)}</mark>)
    } else if (t.startsWith('~~')) {
      out.push(<s key={k}>{inline(t.slice(2, -2), aoAbrirLink, k)}</s>)
    } else {
      out.push(<em key={k}>{inline(t.slice(1, -1), aoAbrirLink, k)}</em>)
    }

    resto = resto.slice(m.index + t.length)
  }

  return out
}

/* ---------- blocos ---------- */

type Props = {
  texto: string
  aoAbrirLink?: AoAbrirLink
  /** Marcar/desmarcar `- [ ]` direto no texto renderizado. */
  aoMarcarTarefa?: (linha: number, feito: boolean) => void
}

export function Markdown({ texto, aoAbrirLink, aoMarcarTarefa }: Props) {
  // O corpo pode ter CRLF: o mesmo split que já corrigiu o parser de tarefas.
  const linhas = texto.split(/\r\n|\n/)
  const out: ReactNode[] = []
  let i = 0
  let n = 0

  while (i < linhas.length) {
    const l = linhas[i]

    // bloco de código
    const cerca = /^```(.*)$/.exec(l)
    if (cerca) {
      const corpo: string[] = []
      i++
      while (i < linhas.length && !/^```/.test(linhas[i])) { corpo.push(linhas[i]); i++ }
      i++
      out.push(
        <pre key={`b${n++}`} className="md-codigo" data-lang={cerca[1].trim() || undefined}>
          <code>{corpo.join('\n')}</code>
        </pre>
      )
      continue
    }

    // fórmula em bloco
    if (l.trim() === '$$') {
      const corpo: string[] = []
      i++
      while (i < linhas.length && linhas[i].trim() !== '$$') { corpo.push(linhas[i]); i++ }
      i++
      out.push(<Formula key={`b${n++}`} src={corpo.join(' ')} bloco />)
      continue
    }

    if (!l.trim()) { i++; continue }

    if (/^---+\s*$/.test(l)) { out.push(<hr key={`b${n++}`} />); i++; continue }

    const h = /^(#{1,6})\s+(.*)$/.exec(l)
    if (h) {
      const nivel = Math.min(h[1].length, 6)
      const Tag = `h${nivel}` as 'h1'
      out.push(<Tag key={`b${n++}`}>{inline(h[2], aoAbrirLink, `b${n}`)}</Tag>)
      i++
      continue
    }

    // tabela: linha com | seguida de linha de separação
    if (l.includes('|') && i + 1 < linhas.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(linhas[i + 1])) {
      const celulas = (s: string): string[] =>
        s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
      const cabecalho = celulas(l)
      i += 2
      const corpo: string[][] = []
      while (i < linhas.length && linhas[i].includes('|')) { corpo.push(celulas(linhas[i])); i++ }
      out.push(
        <div className="md-tabela-caixa" key={`b${n++}`}>
          <table className="md-tabela">
            <thead>
              <tr>{cabecalho.map((c, j) => <th key={j}>{inline(c, aoAbrirLink, `h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {corpo.map((linha, j) => (
                <tr key={j}>{linha.map((c, k) => <td key={k}>{inline(c, aoAbrirLink, `c${k}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (/^>\s?/.test(l)) {
      const corpo: string[] = []
      while (i < linhas.length && /^>\s?/.test(linhas[i])) { corpo.push(linhas[i].replace(/^>\s?/, '')); i++ }
      out.push(
        <blockquote key={`b${n++}`}>
          <Markdown texto={corpo.join('\n')} aoAbrirLink={aoAbrirLink} />
        </blockquote>
      )
      continue
    }

    // lista — inclui tarefas `- [ ]`, que ficam clicáveis
    if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
      const ordenada = /^\s*\d+\./.test(l)
      const itens: { conteudo: string; tarefa: boolean | null; linha: number; nivel: number }[] = []
      while (i < linhas.length && /^\s*([-*+]|\d+\.)\s+/.test(linhas[i])) {
        const bruto = linhas[i]
        const nivel = Math.floor((/^\s*/.exec(bruto)?.[0].length ?? 0) / 2)
        const semMarca = bruto.replace(/^\s*([-*+]|\d+\.)\s+/, '')
        const t = /^\[([ xX])\]\s*(.*)$/.exec(semMarca)
        itens.push({
          conteudo: t ? t[2] : semMarca,
          tarefa: t ? t[1].toLowerCase() === 'x' : null,
          linha: i,
          nivel
        })
        i++
      }
      const Lista = ordenada ? 'ol' : 'ul'
      out.push(
        <Lista key={`b${n++}`} className="md-lista">
          {itens.map(it => (
            <li key={it.linha} data-nivel={it.nivel} data-tarefa={it.tarefa !== null}>
              {it.tarefa !== null && (
                <span
                  className="check"
                  role="checkbox"
                  aria-checked={it.tarefa}
                  onClick={() => aoMarcarTarefa?.(it.linha, !it.tarefa)}
                  data-inerte={!aoMarcarTarefa}
                >
                  {it.tarefa ? '✓' : ''}
                </span>
              )}
              <span data-feito={it.tarefa === true}>{inline(it.conteudo, aoAbrirLink, `l${it.linha}`)}</span>
            </li>
          ))}
        </Lista>
      )
      continue
    }

    // parágrafo: junta linhas até a próxima em branco
    const paragrafo: string[] = []
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s|---+\s*$)/.test(linhas[i])) {
      paragrafo.push(linhas[i])
      i++
    }
    if (paragrafo.length === 0) { i++; continue }
    out.push(<p key={`b${n++}`}>{inline(paragrafo.join(' '), aoAbrirLink, `p${n}`)}</p>)
  }

  return <div className="md">{out}</div>
}
