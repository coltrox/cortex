import type { ReactNode } from 'react'
import { blocos, pedacos, type Bloco } from '../markdown'

/**
 * O corpo de uma nota, desenhado.
 *
 * Antes isto era um `<pre>` com o markdown cru. Com os conteúdos de estudo —
 * que têm título, tabela, fórmula e negrito — a tela virava uma parede de
 * `##`, `**` e `|` justamente no aparelho em que ele estuda fora de casa.
 *
 * A tabela rola na horizontal dentro da própria caixa, e não estica a página:
 * numa tela de 375 px, uma tabela de quatro colunas empurraria a tela inteira
 * para o lado, e aí TUDO fica torto, não só a tabela.
 */
export function CorpoDaNota({ texto }: { texto: string }) {
  const partes = blocos(texto)

  if (partes.length === 0) {
    return <p className="vazio">Esta nota ainda não tem conteúdo.</p>
  }

  return <div className="nota-md">{partes.map((b, i) => desenhar(b, i))}</div>
}

function desenhar(b: Bloco, chave: number): ReactNode {
  switch (b.tipo) {
    case 'titulo': {
      // h2 em diante: o título da nota já é o h1 do cabeçalho da tela, e dois
      // h1 na mesma tela confundem quem navega por leitor de tela.
      const Tag = (['h2', 'h2', 'h3', 'h4', 'h5', 'h6'][b.nivel - 1] ?? 'h6') as 'h2'
      return <Tag key={chave} className="md-titulo">{linha(b.texto)}</Tag>
    }
    case 'paragrafo':
      return <p key={chave} className="md-p">{linha(b.texto)}</p>
    case 'lista':
      return b.numerada
        ? (
          <ol key={chave} className="md-lista">
            {b.itens.map((t, i) => <li key={i}>{linha(t)}</li>)}
          </ol>
        ) : (
          <ul key={chave} className="md-lista">
            {b.itens.map((t, i) => <li key={i}>{linha(t)}</li>)}
          </ul>
        )
    case 'tarefa':
      return (
        <ul key={chave} className="md-tarefas">
          {b.itens.map((t, i) => (
            <li key={i} data-feito={t.feito || undefined}>
              <span className="md-caixa">{t.feito ? '✓' : ''}</span>
              <span>{linha(t.texto)}</span>
            </li>
          ))}
        </ul>
      )
    case 'citacao':
      return <blockquote key={chave} className="md-citacao">{linha(b.texto)}</blockquote>
    case 'formula':
      return <div key={chave} className="md-formula">{b.texto}</div>
    case 'codigo':
      return <pre key={chave} className="md-codigo">{b.texto}</pre>
    case 'regra':
      return <hr key={chave} className="md-regra" />
    case 'tabela':
      return (
        <div key={chave} className="md-tabela-rolagem">
          <table className="md-tabela">
            <thead>
              <tr>{b.cabecalho.map((c, i) => <th key={i}>{linha(c)}</th>)}</tr>
            </thead>
            <tbody>
              {b.linhas.map((l, i) => (
                <tr key={i}>{l.map((c, j) => <td key={j}>{linha(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** Uma linha com negrito, itálico, código, fórmula e link. */
function linha(texto: string): ReactNode {
  return pedacos(texto).map((p, i) => {
    switch (p.tipo) {
      case 'forte': return <strong key={i}>{p.texto}</strong>
      case 'enfase': return <em key={i}>{p.texto}</em>
      case 'codigo': return <code key={i} className="md-cod">{p.texto}</code>
      case 'formula': return <span key={i} className="md-formula-linha">{p.texto}</span>
      // O link entre colchetes aponta para outra nota do vault. No celular
      // ele fica destacado mas não é clicável: a tela de destino depende de
      // qual aba a nota mora, e um link que não leva a lugar nenhum é pior
      // que um texto que diz onde procurar.
      case 'link': return <span key={i} className="md-link">{p.texto}</span>
      default: return <span key={i}>{p.texto}</span>
    }
  })
}
