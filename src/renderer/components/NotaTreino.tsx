import { lerTreino, lerCardio, comMilhar, duracao } from './treinoNota'

/**
 * O treino e o cardio desenhados dentro da nota aberta.
 *
 * O desenhador genérico de campos enfileira os valores de uma lista de
 * objetos, e a sessão de treino — que é uma lista de exercícios com uma lista
 * de séries dentro — saía como uma fila de números sem rótulo. Estes dois
 * blocos entram no lugar dele para `tipo: sessao` e `tipo: cardio`.
 *
 * O markdown do corpo continua aparecendo embaixo, como em qualquer nota: o
 * arquivo continua sendo a verdade, e nada aqui é gravado.
 */

export function NotaTreino({ campos }: { campos: Record<string, unknown> }) {
  const t = lerTreino(campos)
  if (t.exercicios.length === 0) return null

  return (
    <div className="treino-nota">
      <div className="treino-resumo">
        <span><strong>{t.exercicios.length}</strong> {t.exercicios.length === 1 ? 'exercício' : 'exercícios'}</span>
        <span><strong>{t.totalSeries}</strong> {t.totalSeries === 1 ? 'série' : 'séries'}</span>
        {t.volume !== null && (
          <span title="Peso × repetições, somado">
            <strong>{comMilhar(t.volume)}</strong> kg de volume
          </span>
        )}
      </div>

      {t.exercicios.map((e, i) => (
        <div className="treino-ex" key={`${i}-${e.nome}`}>
          <div className="treino-ex-topo">
            <span className="treino-ex-nome">{e.nome}</span>
            <span className="treino-ex-meta">
              {e.quantas > 0 && `${e.quantas}×`}
              {e.reps && ` ${e.reps}`}
              {e.carga !== null && ` · até ${e.carga} kg`}
            </span>
          </div>
          {e.series.length > 0 && (
            <div className="treino-series">
              {e.series.map((s, j) => (
                <span className="treino-serie" key={j}>
                  <i>{j + 1}</i>
                  {s.carga !== null && <b>{s.carga}<em>kg</em></b>}
                  {s.carga !== null && s.reps !== null && <span className="treino-x">×</span>}
                  {s.reps !== null && <b>{s.reps}<em>reps</em></b>}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function NotaCardio({ campos }: { campos: Record<string, unknown> }) {
  const c = lerCardio(campos)
  if (c.minutos === null && c.distancia === null && !c.pace) return null

  return (
    <div className="treino-nota">
      <div className="cardio-nota">
        <span className="cardio-aparelho">{c.aparelho}</span>
        {c.minutos !== null && <strong className="cardio-tempo">{duracao(c.minutos)}</strong>}
        <span className="cardio-extras">
          {c.distancia !== null && <span>{c.distancia} km</span>}
          {c.pace && <span>pace {c.pace}</span>}
          {c.nivel !== null && <span>nível {c.nivel}</span>}
        </span>
      </div>
    </div>
  )
}
