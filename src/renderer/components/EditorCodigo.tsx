import { useMemo, useRef, type KeyboardEvent, type UIEvent } from 'react'
import { colorir } from './colorir'

/** Um nível de indentação. Dois espaços é o que o resto deste projeto usa. */
const PASSO = '  '

/**
 * O editor de código do Dev.
 *
 * É um `textarea` com três coisas que faltavam para ele parar de brigar com
 * quem escreve código: numeração de linha, Tab que indenta em vez de pular
 * para o próximo campo, e Enter que mantém a indentação da linha anterior.
 *
 * Não é o Monaco nem o CodeMirror, e é de propósito: os dois são pesados o
 * bastante para dobrar o tamanho do app.
 *
 * A cor (tema Min do VS Code, pedido do dono) é uma camada por baixo: um
 * `pre` com o texto colorido por `colorir`, e o `textarea` por cima com a
 * letra transparente — só o cursor e a seleção aparecem dele. As duas rolam
 * juntas, e nenhuma quebra linha: é o que mantém letra sobre letra e a
 * numeração batendo com o texto.
 */
export function EditorCodigo({ valor, ext = '', aoMudar, aoSalvar }: {
  valor: string
  /** A extensão do arquivo, que decide as cores. */
  ext?: string
  aoMudar: (v: string) => void
  aoSalvar: () => void
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const calha = useRef<HTMLDivElement>(null)
  const cor = useRef<HTMLPreElement>(null)
  const pedacos = useMemo(() => colorir(valor, ext), [valor, ext])

  const linhas = valor.split('\n').length

  /**
   * Troca o conteúdo e recoloca o cursor.
   *
   * O `setSelectionRange` precisa acontecer depois do React repintar: feito
   * antes, o valor novo chega em seguida e joga o cursor para o fim do texto.
   */
  const substituir = (texto: string, cursor: number): void => {
    aoMudar(texto)
    requestAnimationFrame(() => {
      area.current?.setSelectionRange(cursor, cursor)
    })
  }

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    const ini = el.selectionStart
    const fim = el.selectionEnd

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      aoSalvar()
      return
    }

    if (e.key === 'Tab') {
      // Sem isto, Tab tira o foco do editor — o comportamento padrão do
      // navegador, correto para formulário e errado para código.
      e.preventDefault()
      if (ini === fim) {
        substituir(valor.slice(0, ini) + PASSO + valor.slice(fim), ini + PASSO.length)
        return
      }
      // Com seleção, indenta (ou desindenta, com Shift) o bloco inteiro.
      const antes = valor.lastIndexOf('\n', ini - 1) + 1
      const bloco = valor.slice(antes, fim)
      const novo = e.shiftKey
        ? bloco.split('\n').map(l => (l.startsWith(PASSO) ? l.slice(PASSO.length) : l)).join('\n')
        : bloco.split('\n').map(l => PASSO + l).join('\n')
      substituir(valor.slice(0, antes) + novo + valor.slice(fim), antes + novo.length)
      return
    }

    if (e.key === 'Enter') {
      // Mantém a indentação da linha atual. Sem isso, todo bloco novo começa
      // na coluna zero e a pessoa reindenta à mão a cada linha.
      const inicioDaLinha = valor.lastIndexOf('\n', ini - 1) + 1
      const recuo = /^[ \t]*/.exec(valor.slice(inicioDaLinha, ini))?.[0] ?? ''
      if (recuo === '') return
      e.preventDefault()
      const inserido = '\n' + recuo
      substituir(valor.slice(0, ini) + inserido + valor.slice(fim), ini + inserido.length)
    }
  }

  // A calha e a camada de cor não têm barra de rolagem própria: acompanham a do texto.
  const aoRolar = (e: UIEvent<HTMLTextAreaElement>): void => {
    const { scrollTop, scrollLeft } = e.currentTarget
    if (calha.current) calha.current.scrollTop = scrollTop
    if (cor.current) { cor.current.scrollTop = scrollTop; cor.current.scrollLeft = scrollLeft }
  }

  return (
    <div className="codigo-caixa">
      <div className="codigo-calha" ref={calha} aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="codigo-camadas">
        <pre className="codigo-cor" ref={cor} aria-hidden="true">
          {pedacos.map((p, i) => (p.t ? <span key={i} className={`c-${p.t}`}>{p.s}</span> : p.s))}
          {'\n'}
        </pre>
        <textarea
          ref={area}
          className="editor codigo"
          value={valor}
          wrap="off"
          spellCheck={false}
          onChange={e => aoMudar(e.target.value)}
          onKeyDown={aoTeclar}
          onScroll={aoRolar}
        />
      </div>
    </div>
  )
}
