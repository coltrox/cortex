import { Fragment, useState } from 'react'
import { Check } from './base'
import { opcoesDaRefeicao, resumoDaRefeicao } from './refeicao'

/**
 * Uma refeição do plano, na aba Dieta.
 *
 * Era uma linha só: nome, um travessão e o texto da nutricionista cortado com
 * reticências ("Almoço — 1/3 a 1/2 do prato de salada crua (folhas verdes e
 * legumes frescos, também no fim de sema…"). Dava para marcar como feita e
 * mais nada — para LER o almoço era preciso abrir a nota do plano, e para
 * mudar uma palavra, editar a lista inteira de refeições no formulário.
 *
 * Agora cada refeição é um cartão: clicar abre e mostra as opções uma por
 * linha, com o "ou" entre elas; o lápis edita só aquela refeição.
 */
export function CartaoRefeicao({
  nome, hora, itens, kcal, prot, feito, fator, troca, opcao, aoAlternar, aoEscolher, aoEditar
}: {
  nome: string
  hora: string
  itens: string
  kcal: number
  prot: number
  feito: boolean
  /** 1 comeu tudo, 0,5 metade, 0,25 pouco — o que o celular respondeu. */
  fator: number
  /** O que comeu no lugar, quando trocou. */
  troca: string
  /** Qual das opções foi comida hoje — vazio quando não se escolheu nenhuma. */
  opcao: string
  aoAlternar: () => void
  /** Escolher uma opção marca a refeição; escolher a mesma de novo desmarca. */
  aoEscolher: (texto: string) => void
  aoEditar: () => void
}) {
  const [aberta, setAberta] = useState(false)
  const opcoes = opcoesDaRefeicao(itens)
  const resumo = resumoDaRefeicao(itens)

  return (
    <div className="refeicao" data-feito={feito} data-aberta={aberta}>
      <div
        className="refeicao-topo"
        role="button"
        tabIndex={0}
        aria-expanded={aberta}
        title={aberta ? 'Fechar' : 'Ver o que é'}
        onClick={() => setAberta(a => !a)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberta(a => !a) } }}
      >
        <Check feito={feito} rotulo={nome} aoAlternar={aoAlternar} />
        <span className="refeicao-hora">{hora}</span>
        <span className="refeicao-nome">
          {nome}
          {fator < 1 && <strong className="dieta-nivel">{fator === 0.5 ? 'metade' : 'pouco'}</strong>}
        </span>
        {(kcal > 0 || prot > 0) && (
          <span className="refeicao-macros">
            {kcal > 0 && `${Math.round(kcal * fator)} kcal`}
            {kcal > 0 && prot > 0 && ' · '}
            {prot > 0 && `${Math.round(prot * fator)} g`}
          </span>
        )}
        <button
          className="btn-icone"
          title={`Editar ${nome}`}
          onClick={e => { e.stopPropagation(); aoEditar() }}
        >✎</button>
        <span className="refeicao-seta" aria-hidden="true">›</span>
      </div>

      {/* Trocou: o que comeu no lugar vale mais que o plano, e fica à vista
          mesmo com o cartão fechado. */}
      {troca
        ? <div className="refeicao-troca">No lugar: {troca}</div>
        : opcao && !aberta && <div className="refeicao-escolhido">Comeu: {opcao}</div>}

      {aberta ? (
        <div className="refeicao-corpo">
          {opcoes[0]?.intro && <p className="refeicao-intro">{opcoes[0].intro}</p>}
          {opcoes.length === 0 ? (
            <p className="refeicao-vazia">Sem detalhe. Use o lápis para escrever o que é.</p>
          ) : (
            <div className="refeicao-opcoes" data-uma={opcoes.length === 1}>
              {opcoes.map((o, i) => (
                <Fragment key={i}>
                  {/* O "ou" entre as caixas: elas são alternativas, e não uma
                      receita em etapas — a separação é o que diz isso. */}
                  {i > 0 && <div className="refeicao-ou"><span>ou</span></div>}
                  {/* Clicar na caixa diz "foi esta que eu comi": marca a
                      refeição e guarda a opção no diário do dia. */}
                  <button
                    type="button"
                    className="refeicao-opcao"
                    aria-pressed={opcao === o.texto}
                    data-escolhida={opcao === o.texto}
                    title={opcao === o.texto ? 'Desmarcar' : 'Foi esta que eu comi'}
                    onClick={() => aoEscolher(o.texto)}
                  >
                    <span className="refeicao-opcao-n">
                      {opcao === o.texto ? '✓' : opcoes.length > 1 ? i + 1 : ''}
                    </span>
                    <span className="refeicao-opcao-texto">{o.texto}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      ) : (
        resumo && <div className="refeicao-resumo">{resumo}</div>
      )}
    </div>
  )
}
