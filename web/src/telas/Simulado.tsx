import { useState } from 'react'
import { Botao, Figura } from '../componentes'
import type { ItemCardapio } from '@compartilhado/eventos'
import type { useEnvio } from '../envio'
import type { Questao } from '../exercicios'
import { Rascunho } from './Rascunho'

/**
 * O simulado, feito pelo celular.
 *
 * É o contrário do Treinar, de propósito:
 *
 * - **A correção vem no FIM**, nunca a cada questão. É o que o simulado mede:
 *   aguentar a prova inteira sem saber como está indo. Corrigir no caminho
 *   transformaria isto num treino com outro nome.
 * - **Dá para pular e voltar.** Na prova de verdade também dá, e deixar uma
 *   questão para depois é estratégia, não um erro a ser impedido.
 * - **Nada é gravado até terminar.** Simulado pela metade não é resultado, e
 *   registrar um número parcial sujaria o histórico que ele usa para decidir
 *   o que estudar.
 *
 * O resultado volta para a nota do simulado no vault — acertos, total e
 * `estudado`, os mesmos campos que a lente Estudos já mostra.
 */

const LETRAS = ['a', 'b', 'c', 'd', 'e'] as const

export function Simulado({ item, envio, hoje, aoVoltar }: {
  item: ItemCardapio
  envio: ReturnType<typeof useEnvio>
  hoje: string
  aoVoltar: () => void
}) {
  const detalhe = item.detalhe as Record<string, unknown>
  /* As questões são fotografadas ao abrir.
     O cardápio se atualiza sozinho de tempos em tempos, e trocar a prova
     debaixo de quem está fazendo seria perder o simulado inteiro. */
  const [questoes] = useState<Questao[]>(
    () => (Array.isArray(detalhe.questoes) ? (detalhe.questoes as Questao[]) : [])
  )
  const [atual, setAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<number, string>>({})
  const [terminado, setTerminado] = useState(false)
  const [enviado, setEnviado] = useState(false)

  if (questoes.length === 0) {
    return (
      <div className="bloco">
        <p className="vazio">
          Este simulado ainda não tem questões. Elas são escritas no Cortex, no
          campo <code>questoes</code> da nota.
        </p>
        <Botao tipo="secundario" aoClicar={aoVoltar}>Voltar</Botao>
      </div>
    )
  }

  const certas = questoes.filter((q, i) => respostas[i] && respostas[i] === q.gabarito).length
  const respondidas = Object.keys(respostas).length

  const terminar = (): void => {
    setTerminado(true)
    const path = typeof detalhe.path === 'string' ? detalhe.path : ''
    if (!path) return
    envio.registrar({
      tipo: 'nota_escrita',
      dia: hoje,
      dados: {
        path,
        tipo: 'simulado',
        campos: { acertos: certas, total: questoes.length, estudado: true }
      }
    })
    setEnviado(true)
  }

  if (terminado) {
    const pct = Math.round((certas / questoes.length) * 100)
    const erradas = questoes
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => respostas[i] !== q.gabarito)

    return (
      <div className="bloco">
        <h2 className="md-titulo">Resultado</h2>
        <p className="sessao-resumo">
          <b>{certas} de {questoes.length}</b> · <b>{pct}%</b>
        </p>
        {enviado && (
          <p className="treino-dica">
            O resultado foi para a nota do simulado no Cortex.
          </p>
        )}

        <h2 className="md-titulo">O que errei</h2>
        {erradas.length === 0 ? (
          <p className="treino-dica">Nenhuma. Prova limpa.</p>
        ) : (
          erradas.map(({ q, i }) => (
            <div key={i} className="cartao">
              <div className="treino-de">Questão {i + 1}</div>
              <p className="treino-enunciado">{q.enunciado}</p>
              <p className="treino-dica">
                Você marcou <b>{respostas[i] ? respostas[i].toUpperCase() : '—'}</b>;
                a resposta é <b>{(q.gabarito ?? '').toUpperCase()}</b>.
              </p>
              {q.comentario && <p className="treino-dica">{q.comentario}</p>}
            </div>
          ))
        )}

        <Botao tipo="principal" aoClicar={aoVoltar}>Fechar</Botao>
      </div>
    )
  }

  const q = questoes[atual]
  const ultima = atual === questoes.length - 1

  return (
    <div className="bloco">
      <div className="simulado-topo">
        <span className="treino-de">Questão {atual + 1} de {questoes.length}</span>
        <span className="sessao-nota">{respondidas} respondidas</span>
      </div>
      {/* A barra é a única noção de progresso: não há placar durante a prova,
          porque saber como se está indo muda o jeito de responder. */}
      <div className="simulado-barra">
        <i style={{ width: `${((atual + 1) / questoes.length) * 100}%` }} />
      </div>

      <p className="treino-enunciado">{q?.enunciado}</p>
      <Figura svg={q?.figura} />
      <Rascunho />

      <div className="treino-alternativas">
        {LETRAS.filter(l => q?.[l]).map(l => (
          <button
            key={l}
            type="button"
            className="treino-alternativa"
            data-estado={respostas[atual] === l ? 'marcada' : undefined}
            onClick={() => setRespostas(r => ({ ...r, [atual]: l }))}
          >
            <span className="treino-letra">{l.toUpperCase()}</span>
            <span>{q?.[l]}</span>
          </button>
        ))}
      </div>

      <div className="treino-acoes">
        {atual > 0 && (
          <button type="button" className="btn btn-fantasma"
            onClick={() => setAtual(n => n - 1)}>← Anterior</button>
        )}
        {!ultima ? (
          <Botao tipo="principal" aoClicar={() => setAtual(n => n + 1)}>
            {respostas[atual] ? 'Próxima' : 'Pular'}
          </Botao>
        ) : (
          <Botao tipo="principal" aoClicar={terminar}>Terminar e corrigir</Botao>
        )}
      </div>

      {ultima && respondidas < questoes.length && (
        <p className="treino-dica">
          Faltam {questoes.length - respondidas} sem resposta. Dá para voltar
          antes de corrigir.
        </p>
      )}
    </div>
  )
}
