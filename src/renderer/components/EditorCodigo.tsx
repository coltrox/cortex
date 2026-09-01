import { useRef, type KeyboardEvent, type UIEvent } from 'react'

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
 * bastante para dobrar o tamanho do app, e o que falta neles aqui —
 * coloração — é o que menos importa quando o mesmo arquivo abre no VS Code a
 * um botão de distância.
 */
export function EditorCodigo({ valor, aoMudar, aoSalvar }: {
  valor: string
  aoMudar: (v: string) => void
  aoSalvar: () => void
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const calha = useRef<HTMLDivElement>(null)

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

  // A calha não tem barra de rolagem própria: ela acompanha a do texto.
  const aoRolar = (e: UIEvent<HTMLTextAreaElement>): void => {
    if (calha.current) calha.current.scrollTop = e.currentTarget.scrollTop
  }

  return (
    <div className="codigo-caixa">
      <div className="codigo-calha" ref={calha} aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={area}
        className="editor codigo"
        value={valor}
        spellCheck={false}
        onChange={e => aoMudar(e.target.value)}
        onKeyDown={aoTeclar}
        onScroll={aoRolar}
      />
    </div>
  )
}
