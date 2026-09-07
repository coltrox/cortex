import type { ReactNode } from 'react'

/**
 * O markdown do corpo de uma nota, desenhado no celular.
 *
 * Pequeno de propósito. Não é um renderizador de markdown completo — é o
 * suficiente para o que uma tarefa diária ou uma anotação carrega: título de
 * seção, lista, passo a passo, um pedaço em negrito e link.
 *
 * ## Por que não uma biblioteca
 *
 * As de markdown pesam entre 50 e 200 KB, e este app é baixado por celular em
 * rede de escola. Mais: quase todas produzem HTML e pedem `innerHTML` para
 * inserir, que é a porta de XSS que este app não abre em lugar nenhum. Aqui
 * nada vira HTML — o texto vira elementos React, e um `<script>` escrito no
 * meio da nota chega na tela como os caracteres que ele é.
 *
 * ## Link
 *
 * Só `http://` e `https://` viram `<a>`, e a regra é a mesma do Cortex no
 * computador (ver `Markdown.tsx` lá). `javascript:` num arquivo de texto é a
 * porta clássica; aqui ela simplesmente não abre — vira texto.
 *
 * Abre em aba nova com `rel="noreferrer"`: o app é uma PWA em tela cheia, e
 * uma navegação no lugar tiraria a pessoa de dentro dele sem botão de voltar.
 */
export function Marcacao({ texto }: { texto: string }) {
  const linhas = texto.split(/\r?\n/)
  const blocos: ReactNode[] = []
  let lista: string[] = []

  const fecharLista = (): void => {
    if (lista.length === 0) return
    const itens = lista
    blocos.push(
      <ul key={`l${blocos.length}`} className="md-lista">
        {itens.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </ul>
    )
    lista = []
  }

  for (const linha of linhas) {
    const t = linha.trim()
    if (t === '') { fecharLista(); continue }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(t)
    if (titulo) {
      fecharLista()
      // Todo título vira o mesmo elemento, com o nível só no dado: dentro de
      // um card do celular não há espaço para seis tamanhos de fonte, e um
      // `<h1>` aqui competiria com o nome da tarefa logo acima.
      blocos.push(
        <p key={`t${blocos.length}`} className="md-titulo" data-nivel={titulo[1].length}>
          {inline(titulo[2])}
        </p>
      )
      continue
    }

    // `- [ ]` e `- [x]`: o quadradinho vira símbolo, e não caixa clicável.
    // Quem marca é o check do item, no vault; um segundo lugar de marcar
    // dentro do texto seria uma segunda verdade sobre a mesma coisa.
    const tarefa = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(t)
    if (tarefa) {
      lista.push((tarefa[1] === ' ' ? '☐ ' : '☑ ') + tarefa[2])
      continue
    }

    const item = /^[-*]\s+(.*)$/.exec(t)
    if (item) { lista.push(item[1]); continue }

    fecharLista()
    blocos.push(<p key={`p${blocos.length}`} className="md-p">{inline(t)}</p>)
  }
  fecharLista()

  return <div className="md">{blocos}</div>
}

/** Negrito, código e link, na ordem em que aparecem. */
function inline(texto: string): ReactNode[] {
  const out: ReactNode[] = []
  // Um `exec` em laço com `g` percorre a string uma vez só, e o que sobra
  // entre as marcas vai como texto puro — nada é interpretado duas vezes.
  const marcas = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]*\]\([^)\s]+\))|(https?:\/\/\S+)/g
  let ultimo = 0
  let m: RegExpExecArray | null

  while ((m = marcas.exec(texto)) !== null) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index))
    const k = out.length

    if (m[1]) out.push(<strong key={k}>{m[1].slice(2, -2)}</strong>)
    else if (m[2]) out.push(<code key={k}>{m[2].slice(1, -1)}</code>)
    else if (m[3]) {
      const corte = m[3].indexOf('](')
      out.push(link(m[3].slice(1, corte), m[3].slice(corte + 2, -1), k))
    } else if (m[4]) out.push(link(m[4], m[4], k))

    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo))
  return out
}

/**
 * Este endereço pode virar um link clicável?
 *
 * Só `http://` e `https://`. Fica separado e exportado para poder ser testado
 * sozinho: é a única decisão deste arquivo que, errada, vira problema de
 * segurança — `javascript:` num corpo de nota é a porta clássica, e o corpo
 * de nota agora vem do banco.
 */
export function ehLinkSeguro(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

function link(rotulo: string, url: string, k: number): ReactNode {
  // Qualquer outro esquema vira texto — inclusive `javascript:`.
  if (!ehLinkSeguro(url)) return <span key={k}>{rotulo || url}</span>
  return (
    <a key={k} className="md-link" href={url} target="_blank" rel="noreferrer">
      {rotulo || url}
    </a>
  )
}
