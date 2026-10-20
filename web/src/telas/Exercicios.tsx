import { useState } from 'react'
import { Botao } from '../componentes'
import type { Questao } from '../exercicios'
import { Rascunho } from './Rascunho'

/**
 * Os exercícios de UMA nota, no fim dela.
 *
 * Diferente da tela Treinar, que embaralha o baralho inteiro: aqui a ordem é
 * a da nota, do primeiro ao último, porque estes exercícios são sobre o que
 * acabou de ser lido logo acima. É o mesmo gesto do computador — teoria, e
 * então a prova.
 *
 * A correção continua sendo na hora, e o acerto NÃO é gravado em lugar
 * nenhum: quem guarda histórico é o Treinar, que existe para medir. Aqui o
 * valor está em responder enquanto o assunto está fresco.
 */
export function ExerciciosDaNota({ questoes }: { questoes: Questao[] }) {
  const [aberto, setAberto] = useState(false)
  const [i, setI] = useState(0)
  const [marcada, setMarcada] = useState<string | null>(null)
  const [certas, setCertas] = useState(0)

  if (questoes.length === 0) return null

  if (!aberto) {
    return (
      <div className="nota-exercicios">
        <h2 className="md-titulo">Exercícios</h2>
        <p className="treino-dica">
          {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'} sobre o que
          está aqui em cima. Faça a conta no papel quando a questão pedir.
        </p>
        <Botao tipo="principal" aoClicar={() => setAberto(true)}>
          Fazer os exercícios
        </Botao>
      </div>
    )
  }

  if (i >= questoes.length) {
    return (
      <div className="nota-exercicios">
        <h2 className="md-titulo">Exercícios</h2>
        <p className="treino-dica">
          Você acertou <b>{certas} de {questoes.length}</b>.
        </p>
        <Botao tipo="secundario" aoClicar={() => { setI(0); setCertas(0); setMarcada(null) }}>
          Fazer de novo
        </Botao>
      </div>
    )
  }

  const q = questoes[i]
  const letras = (['a', 'b', 'c', 'd', 'e'] as const).filter(l => q?.[l])
  const acertou = marcada !== null && marcada === q?.gabarito
  const ultima = i === questoes.length - 1

  const responder = (letra: string): void => {
    if (marcada) return
    setMarcada(letra)
    if (letra === q?.gabarito) setCertas(c => c + 1)
  }

  const proxima = (): void => {
    setMarcada(null)
    setI(n => n + 1)
  }

  return (
    <div className="nota-exercicios">
      <h2 className="md-titulo">Exercícios</h2>
      <div className="treino-de">Questão {i + 1} de {questoes.length}</div>
      <p className="treino-enunciado">{q.enunciado}</p>

      {/* A folha de conta fica ANTES das alternativas: a conta vem antes
          da escolha, e um botão depois delas convidaria a chutar primeiro. */}
      <Rascunho />

      <div className="treino-alternativas">
        {letras.map(l => {
          const estado = marcada === null
            ? undefined
            : l === q.gabarito ? 'certa'
              : l === marcada ? 'errada' : undefined
          return (
            <button
              key={l}
              type="button"
              className="treino-alternativa"
              data-estado={estado}
              disabled={marcada !== null}
              onClick={() => responder(l)}
            >
              <span className="treino-letra">{l.toUpperCase()}</span>
              <span>{q[l]}</span>
            </button>
          )
        })}
      </div>

      {marcada !== null && (
        <>
          <div className="treino-correcao" data-acertou={acertou || undefined}>
            <strong>
              {acertou ? 'Acertou.' : `Resposta: ${(q.gabarito ?? '').toUpperCase()}`}
            </strong>
            {q.comentario && <p>{q.comentario}</p>}
          </div>
          <Botao tipo="principal" aoClicar={proxima}>
            {ultima ? 'Ver o resultado' : 'Próxima'}
          </Botao>
        </>
      )}
    </div>
  )
}
