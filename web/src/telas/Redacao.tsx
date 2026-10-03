import { useState } from 'react'
import { Cabecalho, Botao } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/**
 * As estruturas de redação, para consultar na hora de escrever.
 *
 * Esta tela só MOSTRA. Quem escreve as estruturas é o Cortex no computador —
 * o dono ou a IA que fala com ele —, como nota do vault com `tipo: redacao`.
 * Não deixar escrever aqui é a mesma regra do cardápio inteiro: o texto de
 * verdade mora no vault, em Markdown, e um editor no celular criaria uma
 * segunda fonte da mesma coisa.
 *
 * O que ela resolve: na véspera da prova, a estrutura do gênero que vai cair
 * fica no bolso, e não no caderno que ficou em casa.
 */
export function Redacao(p: {
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  /** Qual estrutura está aberta. `null` é a lista. */
  const [aberta, setAberta] = useState<string | null>(null)

  const estruturas = p.cardapio.cardapio.itens.filter(i => i.especie === 'estrutura-redacao')

  /*
   * Agrupadas por gênero.
   *
   * Sem agrupar, dez estruturas viram uma pilha de títulos onde ninguém acha
   * a que quer. Quem não declarou gênero cai em "Outras" — ausência não pode
   * esconder o item.
   */
  const porGenero = new Map<string, typeof estruturas>()
  for (const e of estruturas) {
    const g = typeof e.detalhe.genero === 'string' && e.detalhe.genero
      ? e.detalhe.genero
      : 'Outras'
    porGenero.set(g, [...(porGenero.get(g) ?? []), e])
  }

  const escolhida = estruturas.find(e => e.nome === aberta)

  if (escolhida) {
    const corpo = typeof escolhida.detalhe.corpo === 'string' ? escolhida.detalhe.corpo : ''
    return (
      <div>
        <Cabecalho titulo={escolhida.nome} aoVoltar={() => setAberta(null)} />
        <div className="bloco">
          {/* Texto cru, com as quebras preservadas: a estrutura é uma lista de
              passos, e reformatá-la aqui só tiraria a forma com que foi
              escrita do outro lado. */}
          <pre className="redacao-corpo">
            {corpo || 'Esta estrutura ainda não tem conteúdo.'}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Cabecalho titulo="Estruturas de redação" aoVoltar={() => p.irPara('estudo')} />
      <div className="bloco">
        {estruturas.length === 0 && (
          <p className="vazio">
            Nenhuma estrutura ainda. Elas são escritas no Cortex, no computador:
            uma nota com <code>tipo: estrutura-redacao</code> e o passo a passo no corpo.
          </p>
        )}

        {[...porGenero.entries()].map(([genero, lista]) => (
          <section key={genero} className="grupo-redacao">
            <h2 className="titulo-grupo">{genero}</h2>
            {lista.map(e => (
              <button
                key={e.nome}
                type="button"
                className="cartao cartao-redacao"
                onClick={() => setAberta(e.nome)}
              >
                <span className="redacao-nome">{e.nome}</span>
                {typeof e.detalhe.quando === 'string' && e.detalhe.quando && (
                  <span className="redacao-quando">{e.detalhe.quando}</span>
                )}
                <span className="seta">›</span>
              </button>
            ))}
          </section>
        ))}

        <Botao tipo="secundario" aoClicar={() => p.irPara('estudo')}>Voltar</Botao>
      </div>
    </div>
  )
}
