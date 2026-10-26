import { useState, type ReactNode } from 'react'
import { blocos, pedacos, partesDaFormula, type Bloco } from '../markdown'
import { guardadoDoNavegador } from '../guardado'
import { alternar, chaveDaTarefa, estaFeita, gravarMarcados, lerMarcados } from '../marcados'

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
export function CorpoDaNota({ texto, nota, aoAbrirNota, aoMarcar }: {
  texto: string
  /** O nome da nota — identifica os checks guardados neste aparelho. */
  nota: string
  /** Chamado quando se toca num link `[[assim]]`. */
  aoAbrirNota?: (nome: string) => void
  /**
   * Chamado ao marcar ou desmarcar uma tarefa, para quem souber mandá-la ao
   * Cortex. Sem isto a marca valeria só neste aparelho — que era justamente
   * a reclamação: "marquei no celular e no computador não atualizou".
   */
  aoMarcar?: (indice: number, texto: string, feito: boolean) => void
}) {
  const [marcados, setMarcados] = useState(() => lerMarcados(guardadoDoNavegador))
  const partes = blocos(texto)

  if (partes.length === 0) {
    return <p className="vazio">Esta nota ainda não tem conteúdo.</p>
  }

  /* Quantas tarefas vieram ANTES de cada bloco.
   *
   * O índice precisa ser o da nota inteira, e não o de dentro do bloco: é
   * por ele que o Cortex acha a linha `- [ ]` certa dentro do arquivo. */
  const antesDe: number[] = []
  let corridas = 0
  for (const b of partes) {
    antesDe.push(corridas)
    if (b.tipo === 'tarefa') corridas += b.itens.length
  }

  const alternarTarefa = (indice: number, textoDaTarefa: string): void => {
    const chave = chaveDaTarefa(nota, indice)
    const m = alternar(marcados, chave)
    gravarMarcados(guardadoDoNavegador, m)
    setMarcados(m)
    aoMarcar?.(indice, textoDaTarefa, m[chave] === true)
  }

  return (
    <div className="nota-md">
      {partes.map((b, i) => desenhar(
        b, i, { nota, marcados, alternarTarefa, aoAbrirNota, antesDe: antesDe[i] ?? 0 }
      ))}
    </div>
  )
}

type Ferramentas = {
  nota: string
  marcados: Record<string, true>
  alternarTarefa: (indice: number, texto: string) => void
  aoAbrirNota?: (nome: string) => void
  /** Quantas tarefas da nota vieram antes deste bloco. */
  antesDe: number
}

function desenhar(b: Bloco, chave: number, f: Ferramentas): ReactNode {
  switch (b.tipo) {
    case 'titulo': {
      // h2 em diante: o título da nota já é o h1 do cabeçalho da tela, e dois
      // h1 na mesma tela confundem quem navega por leitor de tela.
      const Tag = (['h2', 'h2', 'h3', 'h4', 'h5', 'h6'][b.nivel - 1] ?? 'h6') as 'h2'
      return <Tag key={chave} className="md-titulo">{linha(b.texto, f)}</Tag>
    }
    case 'paragrafo':
      return <p key={chave} className="md-p">{linha(b.texto, f)}</p>
    case 'lista':
      return b.numerada
        ? (
          <ol key={chave} className="md-lista">
            {b.itens.map((t, i) => <li key={i}>{linha(t, f)}</li>)}
          </ol>
        ) : (
          <ul key={chave} className="md-lista">
            {b.itens.map((t, i) => <li key={i}>{linha(t, f)}</li>)}
          </ul>
        )
    case 'tarefa':
      return (
        <ul key={chave} className="md-tarefas">
          {b.itens.map((t, i) => {
            /* O índice conta as tarefas da NOTA INTEIRA, em ordem: a
               terceira tarefa da nota é a 2, esteja ela em que bloco
               estiver. É por ele que o Cortex acha a linha `- [ ]` certa
               dentro do arquivo para riscar. */
            const indice = f.antesDe + i
            const feita = estaFeita(f.marcados, chaveDaTarefa(f.nota, indice), t.feito)
            return (
              <li key={i} data-feito={feita || undefined}>
                <button
                  type="button"
                  className="md-caixa"
                  aria-pressed={feita}
                  aria-label={feita ? 'desmarcar' : 'marcar como feito'}
                  onClick={() => f.alternarTarefa(indice, t.texto)}
                >{feita ? '✓' : ''}</button>
                <span>{linha(t.texto, f)}</span>
              </li>
            )
          })}
        </ul>
      )
    case 'citacao':
      return <blockquote key={chave} className="md-citacao">{linha(b.texto, f)}</blockquote>
    case 'formula':
      /* Cada fórmula na sua caixa, e a fração empilhada de verdade.
         Antes isto era uma linha só de texto: duas fórmulas vinham coladas e
         a fração virava `(m v^2)/(2)`, com barra e parêntese no lugar do
         traço. Ele comparou as duas telas, e a diferença era gritante. */
      return (
        <div key={chave} className="md-formula">
          {partesDaFormula(b.cru).map((formula, i) => (
            <div key={i} className="md-formula-item">
              {formula.map((p, j) => {
                if (p.tipo === 'fracao') {
                  return (
                    <span key={j} className="md-fracao">
                      <span className="md-fracao-cima">{p.cima}</span>
                      <span className="md-fracao-baixo">{p.baixo}</span>
                    </span>
                  )
                }
                if (p.tipo === 'sub') return <sub key={j}>{p.texto}</sub>
                return <span key={j}>{p.texto}</span>
              })}
            </div>
          ))}
        </div>
      )
    case 'codigo':
      return <pre key={chave} className="md-codigo">{b.texto}</pre>
    case 'regra':
      return <hr key={chave} className="md-regra" />
    case 'tabela':
      return (
        <div key={chave} className="md-tabela-rolagem">
          <table className="md-tabela">
            <thead>
              <tr>{b.cabecalho.map((c, i) => <th key={i}>{linha(c, f)}</th>)}</tr>
            </thead>
            <tbody>
              {b.linhas.map((l, i) => (
                <tr key={i}>{l.map((c, j) => <td key={j}>{linha(c, f)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** Uma linha com negrito, itálico, código, fórmula e link. */
function linha(texto: string, f: Ferramentas): ReactNode {
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
      case 'link':
        // Clicável quando a tela sabe abrir outra nota. Sem o callback, o
        // link vira destaque de leitura — melhor que um botão morto.
        return f.aoAbrirNota
          ? (
            <button
              key={i} type="button" className="md-link"
              onClick={() => f.aoAbrirNota?.(p.texto)}
            >{p.texto}</button>
          )
          : <span key={i} className="md-link">{p.texto}</span>
      default: return <span key={i}>{p.texto}</span>
    }
  })
}
