import { useEffect, useMemo, useRef, useState } from 'react'
import { ocorrencias } from './buscaTexto'

/*
 * Ctrl+F dentro de uma nota.
 *
 * Pedido dele, ao pé da letra: "adicione também Ctrl+F para conseguir
 * pesquisar dentro dos arquivos de texto".
 *
 * A nota tem dois modos, e eles pedem técnicas diferentes — é por isso que
 * esta busca não é a mesma do editor de código, embora use o mesmo
 * `ocorrencias()`:
 *
 *   LENDO, o texto é DOM — markdown já virado parágrafo, tabela e link. Dá
 *   para marcar sem tocar no documento, com a API de marcação do navegador
 *   (`CSS.highlights`): ela pinta intervalos sem inserir um `<mark>` no meio
 *   do conteúdo, que é o que estragaria o markdown renderizado e as
 *   referências que o React controla.
 *
 *   EDITANDO, o texto é o valor de um `textarea`, e DOM nenhum existe: ali a
 *   marcação é a própria seleção.
 *
 * As duas contam as ocorrências no que ESTÁ NA TELA. Contar no markdown cru
 * enquanto se lê daria um número que não bate com o que se vê: procurar
 * "tema" acharia também o `tema:` do cabeçalho, que a leitura esconde.
 */

/** O registro de marcações do navegador, quando existe. */
type RegistroDeMarcas = { set(nome: string, marcas: object): void; delete(nome: string): void }
const registroDeMarcas = (): RegistroDeMarcas | null => {
  const c = CSS as unknown as { highlights?: RegistroDeMarcas }
  return c.highlights ?? null
}
const FabricaDeMarca = (globalThis as unknown as {
  Highlight?: new (...intervalos: Range[]) => object
}).Highlight

const MARCAS = 'busca-nota'
const MARCA_ATUAL = 'busca-nota-atual'

const limparMarcas = (): void => {
  const reg = registroDeMarcas()
  if (!reg) return
  reg.delete(MARCAS)
  reg.delete(MARCA_ATUAL)
}

/**
 * O intervalo que cobre `[inicio, fim)` do texto corrido de `raiz`.
 *
 * `textContent` concatena os nós de texto na mesma ordem em que o
 * `TreeWalker` os visita, então a posição contada num bate com a do outro —
 * é isso que permite procurar numa string simples e marcar no documento.
 */
function intervaloEm(raiz: HTMLElement, inicio: number, fim: number): Range | null {
  const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  const r = document.createRange()
  let pos = 0
  let comecou = false
  for (let no = andador.nextNode(); no; no = andador.nextNode()) {
    const tamanho = no.nodeValue?.length ?? 0
    if (!comecou && pos + tamanho > inicio) {
      r.setStart(no, inicio - pos)
      comecou = true
    }
    if (comecou && pos + tamanho >= fim) {
      r.setEnd(no, fim - pos)
      return r
    }
    pos += tamanho
  }
  return null
}

type Props = {
  /** Modo de edição: muda onde o texto mora e como a ocorrência é marcada. */
  editando: boolean
  /** A caixa de texto, quando editando. */
  area: React.RefObject<HTMLTextAreaElement | null>
  /** O que está DENTRO da caixa — nem sempre é a nota inteira (redação esconde o cabeçalho). */
  textoDoEditor: string
  /** O que envolve o texto lido, para varrer o documento. */
  raiz: React.RefObject<HTMLElement | null>
  /** Muda quando a nota muda: refaz a conta sem depender de o DOM avisar. */
  versao: string
  aoFechar: () => void
}

export function BuscaNaNota({ editando, area, textoDoEditor, raiz, versao, aoFechar }: Props) {
  const campo = useRef<HTMLInputElement>(null)
  const [termo, setTermo] = useState('')
  const [atual, setAtual] = useState(0)

  /* O texto onde se procura. Lendo, é o que o documento mostra. */
  const alvo = useMemo(
    () => (editando ? textoDoEditor : raiz.current?.textContent ?? ''),
    [editando, textoDoEditor, versao, raiz]
  )
  const achados = useMemo(() => ocorrencias(alvo, termo), [alvo, termo])

  /* O campo recebe o foco ao abrir — senão a primeira tecla digitada iria
     para a nota, que no modo de leitura não tem onde pôr. */
  useEffect(() => { campo.current?.focus(); campo.current?.select() }, [])

  /* Sai de cena sem deixar marca pintada no documento. */
  useEffect(() => limparMarcas, [])

  const irPara = (i: number): void => {
    if (achados.length === 0) { limparMarcas(); return }
    const n = ((i % achados.length) + achados.length) % achados.length
    setAtual(n)
    const pos = achados[n]

    if (editando) {
      const el = area.current
      if (!el) return
      el.setSelectionRange(pos, pos + termo.length)
      /* Focar a caixa é o que a rola até a seleção; o foco volta ao campo em
         seguida para continuar digitando. A seleção segue visível — o CSS
         pinta `::selection` também com a caixa sem foco. */
      el.focus()
      campo.current?.focus()
      return
    }

    const el = raiz.current
    const reg = registroDeMarcas()
    if (!el || !reg || !FabricaDeMarca) return
    const todos: Range[] = []
    for (const p of achados) {
      const r = intervaloEm(el, p, p + termo.length)
      if (r) todos.push(r)
    }
    const escolhido = intervaloEm(el, pos, pos + termo.length)
    reg.set(MARCAS, new FabricaDeMarca(...todos))
    if (escolhido) {
      reg.set(MARCA_ATUAL, new FabricaDeMarca(escolhido))
      /* Rola pelo elemento que contém a ocorrência: um `Range` não rola
         sozinho, e o parágrafo é a menor unidade que o usuário reconhece. */
      const dentro = escolhido.startContainer.parentElement
      dentro?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  /* Digitar já leva à primeira ocorrência, como em qualquer Ctrl+F. */
  useEffect(() => {
    if (achados.length > 0) irPara(0)
    else { setAtual(0); limparMarcas() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, alvo])

  return (
    <div className="nota-busca" role="search">
      <input
        ref={campo}
        value={termo}
        placeholder="Procurar na nota"
        aria-label="Procurar na nota"
        onChange={e => setTermo(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); irPara(atual + (e.shiftKey ? -1 : 1)) }
          else if (e.key === 'F3') { e.preventDefault(); irPara(atual + (e.shiftKey ? -1 : 1)) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); limparMarcas(); aoFechar() }
        }}
      />
      <span className="nota-busca-conta" data-vazio={!!termo && achados.length === 0}>
        {!termo ? '' : achados.length === 0 ? 'Nada' : `${atual + 1} de ${achados.length}`}
      </span>
      <button className="btn-icone" title="Anterior (Shift+Enter)" disabled={achados.length === 0}
        onClick={() => irPara(atual - 1)}>↑</button>
      <button className="btn-icone" title="Próxima (Enter)" disabled={achados.length === 0}
        onClick={() => irPara(atual + 1)}>↓</button>
      <button className="btn-icone" title="Fechar (Esc)"
        onClick={() => { limparMarcas(); aoFechar() }}>×</button>
    </div>
  )
}
