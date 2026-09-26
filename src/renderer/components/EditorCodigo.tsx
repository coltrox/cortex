import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type UIEvent } from 'react'
import { colorir } from './colorir'
import { ocorrencias, linhaEColuna } from './buscaTexto'
import { trechoDeCaminho, filtrarSugestoes, aplicarSugestao, type TrechoDeCaminho } from './caminhoSugestao'

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
 *
 * O Ctrl+F (pedido do dono) é mais uma camada, embaixo de todas: um `pre` de
 * letra invisível em que só as ocorrências aparecem, como fundo marcado.
 */
export function EditorCodigo({
  valor, ext = '', chave = '', posicao, aoMudar, aoSalvar, aoPosicao, listarPasta
}: {
  valor: string
  /** A extensão do arquivo, que decide as cores. */
  ext?: string
  /** Qual arquivo está aberto: mudou a chave, a posição guardada é outra. */
  chave?: string
  /** Onde este arquivo estava da última vez (rolagem e cursor). */
  posicao?: { scroll: number; cursor: number }
  aoMudar: (v: string) => void
  aoSalvar: () => void
  /** Avisa onde o texto está, para voltar aqui quando o arquivo reabrir. */
  aoPosicao?: (p: { scroll: number; cursor: number }) => void
  /** Lista uma pasta relativa ao arquivo aberto, para sugerir caminho no `./`. */
  listarPasta?: (rel: string) => Promise<{ nome: string; pasta: boolean }[]>
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const calha = useRef<HTMLDivElement>(null)
  const cor = useRef<HTMLPreElement>(null)
  const marcas = useRef<HTMLPreElement>(null)
  const campoBusca = useRef<HTMLInputElement>(null)
  const pedacos = useMemo(() => colorir(valor, ext), [valor, ext])

  /** A barra do Ctrl+F: aberta, o que se procura e qual ocorrência está em destaque. */
  const [buscando, setBuscando] = useState(false)
  const [termo, setTermo] = useState('')
  const [atual, setAtual] = useState(0)
  const achados = useMemo(() => (buscando ? ocorrencias(valor, termo) : []), [buscando, valor, termo])

  const linhas = valor.split('\n').length

  /*
   * A posição guardada por arquivo (pedido do dono: "to com a tela la na
   * linha 310, sai e voltei, nao voltar no inicio e sim onde eu estava").
   *
   * A restauração espera o repintar: antes dele o `textarea` ainda tem o
   * texto do arquivo anterior, e rolar para a linha 310 de outro arquivo não
   * quer dizer nada.
   */
  useEffect(() => {
    const el = area.current
    if (!el) return
    const p = posicao
    requestAnimationFrame(() => {
      el.scrollTop = p?.scroll ?? 0
      el.scrollLeft = 0
      if (p) el.setSelectionRange(p.cursor, p.cursor)
      // As camadas de cor e de marcas não rolam sozinhas.
      if (calha.current) calha.current.scrollTop = el.scrollTop
      for (const camada of [cor.current, marcas.current]) {
        if (camada) { camada.scrollTop = el.scrollTop; camada.scrollLeft = 0 }
      }
    })
    // Só quando o arquivo muda: dentro do mesmo arquivo quem manda é quem digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const anotarPosicao = (): void => {
    const el = area.current
    if (el && aoPosicao) aoPosicao({ scroll: el.scrollTop, cursor: el.selectionStart })
  }

  /* ---------- sugestão de caminho ao digitar ./ ---------- */

  const [sug, setSug] = useState<{
    trecho: TrechoDeCaminho
    itens: { nome: string; pasta: boolean }[]
    escolhido: number
    x: number
    y: number
  } | null>(null)
  /** O que já foi lido de cada pasta nesta sessão de edição. */
  const pastasLidas = useRef(new Map<string, { nome: string; pasta: boolean }[]>())

  /** Onde desenhar o balão: na letra do cursor, uma linha abaixo. */
  const pontoDoCursor = (pos: number): { x: number; y: number } => {
    const el = area.current
    if (!el) return { x: 0, y: 0 }
    const estilo = getComputedStyle(el)
    const alturaLinha = parseFloat(estilo.lineHeight) || 20
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) ctx.font = `${estilo.fontSize} ${estilo.fontFamily}`
    const larguraLetra = ctx?.measureText('M').width || 8
    const { linha, coluna } = linhaEColuna(valor, pos)
    return {
      x: coluna * larguraLetra - el.scrollLeft + 8,
      y: (linha + 1) * alturaLinha - el.scrollTop + 4
    }
  }

  const repensarSugestao = async (texto: string, cursor: number): Promise<void> => {
    if (!listarPasta) return
    const trecho = trechoDeCaminho(texto, cursor)
    if (!trecho) { setSug(null); return }
    const lidas = pastasLidas.current
    let nomes = lidas.get(trecho.pasta)
    if (!nomes) {
      nomes = await listarPasta(trecho.pasta).catch(() => [])
      lidas.set(trecho.pasta, nomes)
    }
    const itens = filtrarSugestoes(nomes, trecho.parcial)
    if (itens.length === 0) { setSug(null); return }
    setSug({ trecho, itens, escolhido: 0, ...pontoDoCursor(cursor) })
  }

  /**
   * Onde reabrir o balão depois que o texto novo chegar.
   *
   * Escolher uma pasta tem que mostrar o que tem dentro dela — mas o texto
   * ainda é o antigo neste instante: `substituir` avisa o pai, e o valor novo
   * só volta no próximo render. Por isso a reabertura espera o `valor` mudar,
   * em vez de acontecer aqui.
   */
  const reabrirEm = useRef<number | null>(null)

  useEffect(() => {
    const pos = reabrirEm.current
    if (pos === null) return
    reabrirEm.current = null
    void repensarSugestao(valor, pos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  const aceitarSugestao = (i: number): void => {
    if (!sug) return
    const escolha = sug.itens[i]
    if (!escolha) return
    const r = aplicarSugestao(valor, sug.trecho, escolha)
    setSug(null)
    // Só o pedaço do caminho é reescrito — e pelo caminho que mantém o Ctrl+Z.
    escrever(
      sug.trecho.inicio,
      sug.trecho.inicio + sug.trecho.texto.length,
      r.texto.slice(sug.trecho.inicio, r.cursor)
    )
    // Pasta escolhida: já mostra o que tem dentro dela.
    if (escolha.pasta) reabrirEm.current = r.cursor
  }

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

  /**
   * Escreve no lugar da seleção SEM quebrar o Ctrl+Z.
   *
   * O navegador guarda o histórico de desfazer do próprio campo, e ele só
   * enxerga o que foi digitado ou inserido por comando de edição. Trocar o
   * texto inteiro por código (o `substituir` acima) apaga esse histórico —
   * era isso que fazia o Ctrl+Z parar de funcionar depois de um Tab, de um
   * Enter com indentação ou de aceitar um caminho.
   *
   * `insertText` é o mesmo comando que o navegador usa ao colar: entra na
   * pilha de desfazer, com seleção e tudo. Se ele recusar (retorna `false`),
   * cai no caminho antigo — melhor perder o desfazer do que o texto.
   */
  const escrever = (inicio: number, fim: number, texto: string): void => {
    const el = area.current
    if (!el) return
    el.focus()
    el.setSelectionRange(inicio, fim)
    // O React não vê o `execCommand` direto: o evento de input dispara
    // sozinho e o `onChange` leva o valor novo ao pai.
    if (document.execCommand('insertText', false, texto)) return
    substituir(el.value.slice(0, inicio) + texto + el.value.slice(fim), inicio + texto.length)
  }

  /**
   * Leva a ocorrência `i` para o meio da tela e a deixa selecionada.
   *
   * A rolagem é calculada pela linha e coluna: o `textarea` só rola sozinho
   * até a seleção quando tem o foco, e o foco está no campo da busca.
   */
  const irPara = (i: number): void => {
    const el = area.current
    if (!el || achados.length === 0) return
    const n = ((i % achados.length) + achados.length) % achados.length
    setAtual(n)
    const pos = achados[n]
    el.setSelectionRange(pos, pos + termo.length)
    const estilo = getComputedStyle(el)
    const alturaLinha = parseFloat(estilo.lineHeight) || 20
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) ctx.font = `${estilo.fontSize} ${estilo.fontFamily}`
    const larguraLetra = ctx?.measureText('M').width || 8
    const { linha, coluna } = linhaEColuna(valor, pos)
    el.scrollTop = Math.max(0, linha * alturaLinha - el.clientHeight / 2)
    el.scrollLeft = Math.max(0, coluna * larguraLetra - el.clientWidth / 2)
  }

  const abrirBusca = (): void => {
    const el = area.current
    // O que está selecionado (numa linha só) já vira o termo, como no VS Code.
    const sel = el ? valor.slice(el.selectionStart, el.selectionEnd) : ''
    if (sel && !sel.includes('\n')) setTermo(sel)
    setBuscando(true)
    requestAnimationFrame(() => { campoBusca.current?.focus(); campoBusca.current?.select() })
  }

  const fecharBusca = (): void => {
    setBuscando(false)
    const el = area.current
    if (!el) return
    // Volta para o texto com a ocorrência selecionada, para seguir dali.
    const pos = achados[atual]
    el.focus()
    if (pos !== undefined) el.setSelectionRange(pos, pos + termo.length)
  }

  // Digitar na busca já leva até a primeira ocorrência.
  useEffect(() => {
    if (buscando && achados.length > 0) irPara(0)
    else setAtual(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, buscando])

  // Ctrl+F em qualquer lugar do Dev com um arquivo aberto (o foco pode estar na árvore).
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); abrirBusca() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    const ini = el.selectionStart
    const fim = el.selectionEnd

    // Com o balão de caminho aberto, as setas e o Enter são dele.
    if (sug) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const passo = e.key === 'ArrowDown' ? 1 : -1
        setSug(s => (s ? { ...s, escolhido: (s.escolhido + passo + s.itens.length) % s.itens.length } : s))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); aceitarSugestao(sug.escolhido); return }
      if (e.key === 'Escape') { e.preventDefault(); setSug(null); return }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      aoSalvar()
      return
    }

    // F3 e Shift+F3: próxima e anterior, sem sair do texto.
    if (e.key === 'F3' && buscando) {
      e.preventDefault()
      irPara(atual + (e.shiftKey ? -1 : 1))
      return
    }

    if (e.key === 'Tab') {
      // Sem isto, Tab tira o foco do editor — o comportamento padrão do
      // navegador, correto para formulário e errado para código.
      e.preventDefault()
      if (ini === fim) {
        escrever(ini, fim, PASSO)
        return
      }
      // Com seleção, indenta (ou desindenta, com Shift) o bloco inteiro.
      const antes = valor.lastIndexOf('\n', ini - 1) + 1
      const bloco = valor.slice(antes, fim)
      const novo = e.shiftKey
        ? bloco.split('\n').map(l => (l.startsWith(PASSO) ? l.slice(PASSO.length) : l)).join('\n')
        : bloco.split('\n').map(l => PASSO + l).join('\n')
      escrever(antes, fim, novo)
      return
    }

    if (e.key === 'Enter') {
      // Mantém a indentação da linha atual. Sem isso, todo bloco novo começa
      // na coluna zero e a pessoa reindenta à mão a cada linha.
      const inicioDaLinha = valor.lastIndexOf('\n', ini - 1) + 1
      const recuo = /^[ \t]*/.exec(valor.slice(inicioDaLinha, ini))?.[0] ?? ''
      if (recuo === '') return
      e.preventDefault()
      escrever(ini, fim, '\n' + recuo)
    }
  }

  // A calha e as camadas de cor e de busca não têm barra de rolagem própria:
  // acompanham a do texto.
  const aoRolar = (e: UIEvent<HTMLTextAreaElement>): void => {
    const { scrollTop, scrollLeft } = e.currentTarget
    if (aoPosicao) aoPosicao({ scroll: scrollTop, cursor: e.currentTarget.selectionStart })
    if (calha.current) calha.current.scrollTop = scrollTop
    for (const camada of [cor.current, marcas.current]) {
      if (camada) { camada.scrollTop = scrollTop; camada.scrollLeft = scrollLeft }
    }
  }

  /** O texto invisível com as ocorrências marcadas — a camada de baixo. */
  const comMarcas = useMemo(() => {
    if (achados.length === 0) return null
    const partes: ReactNode[] = []
    let de = 0
    achados.forEach((pos, i) => {
      partes.push(valor.slice(de, pos))
      partes.push(<mark key={i} className={i === atual ? 'atual' : undefined}>{valor.slice(pos, pos + termo.length)}</mark>)
      de = pos + termo.length
    })
    partes.push(valor.slice(de))
    return partes
  }, [achados, atual, valor, termo])

  return (
    <div className="codigo-caixa">
      <div className="codigo-calha" ref={calha} aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="codigo-camadas">
        <pre className="codigo-marcas" ref={marcas} aria-hidden="true">
          {comMarcas}
          {'\n'}
        </pre>
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
          onChange={e => {
            aoMudar(e.target.value)
            void repensarSugestao(e.target.value, e.target.selectionStart)
          }}
          onKeyDown={aoTeclar}
          onKeyUp={anotarPosicao}
          onClick={() => { anotarPosicao(); setSug(null) }}
          onBlur={() => { anotarPosicao(); setSug(null) }}
          onScroll={aoRolar}
        />

        {/* O balão de caminho: a pasta do arquivo aberto, filtrada pelo que já
            foi digitado. Setas escolhem, Enter ou Tab aceita, Esc fecha. */}
        {sug && (
          <ul className="codigo-sugestoes" style={{ left: sug.x, top: sug.y }} role="listbox">
            {sug.itens.map((it, i) => (
              <li key={it.nome}>
                <button
                  type="button"
                  data-escolhido={i === sug.escolhido}
                  data-pasta={it.pasta}
                  onMouseDown={e => { e.preventDefault(); aceitarSugestao(i) }}
                >
                  <span className="sug-icone" aria-hidden="true">{it.pasta ? '▸' : '·'}</span>
                  {it.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
        {buscando && (
          <div className="codigo-busca" role="search">
            <input
              ref={campoBusca}
              value={termo}
              placeholder="Procurar"
              aria-label="Procurar no arquivo"
              onChange={e => setTermo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); irPara(atual + (e.shiftKey ? -1 : 1)) }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharBusca() }
                else if (e.key === 'F3') { e.preventDefault(); irPara(atual + (e.shiftKey ? -1 : 1)) }
              }}
            />
            <span className="codigo-busca-conta" data-vazio={!!termo && achados.length === 0}>
              {!termo ? '' : achados.length === 0 ? 'Nada' : `${atual + 1} de ${achados.length}`}
            </span>
            <button className="btn-icone" title="Anterior (Shift+Enter)" disabled={achados.length === 0}
              onClick={() => irPara(atual - 1)}>↑</button>
            <button className="btn-icone" title="Próxima (Enter)" disabled={achados.length === 0}
              onClick={() => irPara(atual + 1)}>↓</button>
            <button className="btn-icone" title="Fechar (Esc)" onClick={fecharBusca}>×</button>
          </div>
        )}
      </div>
    </div>
  )
}
