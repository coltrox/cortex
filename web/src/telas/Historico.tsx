import { useState } from 'react'
import { diaLocal } from '../montar'
import { historicoPorData, sessoesFeitas, cardios, dataCurta, type SessaoFeita } from '../cardapio'
import { Cabecalho, Aviso, Secao } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'

/**
 * O histórico: o que já foi treinado, dia a dia.
 *
 * Ficava embaixo da lista de treinos, na mesma tela de começar um — e com
 * vinte sessões era preciso rolar meio quilômetro para chegar ao botão do
 * treino de hoje. Virou aba própria, ao lado de Treino, a pedido do dono:
 * "senão fica muita informação".
 *
 * Um bloco por DIA, e não uma lista de sessões: treino e cardio do mesmo dia
 * aparecem juntos, que é como o dia aconteceu.
 */

/** "47×12 · 61×10 · 68×8" — as séries de um exercício numa linha. */
export function linhaDeSeries(e: SessaoFeita['exercicios'][number]): string {
  const feitas = e.feitas
    .map(s => [s.carga !== null ? String(s.carga) : '', s.reps !== null ? String(s.reps) : '']
      .filter(Boolean).join('×'))
    .filter(Boolean)
  if (feitas.length > 0) return feitas.join(' · ')
  // Sessão antiga, publicada só com o resumo.
  return [e.series ? `${e.series}×` : '', e.reps, e.carga !== null ? `${e.carga} kg` : '']
    .filter(Boolean).join(' ')
}

export function Historico(p: { cardapio: UsoDoCardapio; irPara: (t: Tela) => void }) {
  const hoje = diaLocal()
  const dias = historicoPorData(sessoesFeitas(p.cardapio.cardapio), cardios(p.cardapio.cardapio))
  /** Qual treino está aberto mostrando as séries — um de cada vez. */
  const [aberto, setAberto] = useState<string | null>(null)

  return (
    <div className="tema-treino">
      <Cabecalho titulo="Histórico" />
      <div className="bloco">
        <SubNavSaude atual="historico" irPara={p.irPara} />

        {dias.length === 0 && (
          <Aviso titulo="Nada registrado ainda">
            Ao registrar um treino ou um cardio, ele aparece aqui — e também no
            Cortex do computador.
          </Aviso>
        )}

        {dias.map(dia => (
          <div className="historico-dia" key={dia.data}>
            <Secao nome={dataCurta(dia.data, hoje)} />

            {dia.sessoes.map((s, i) => {
              const chave = `${dia.data}|${s.modelo}|${i}`
              const series = s.exercicios.reduce((n, e) => n + (e.feitas.length || e.series || 0), 0)
              return (
                <div className="feito" key={chave}>
                  <button className="cartao" type="button"
                    aria-expanded={aberto === chave}
                    onClick={() => setAberto(a => (a === chave ? null : chave))}>
                    <span className="cartao-corpo">
                      <span className="cartao-topo">
                        <span className="cartao-nome">{s.modelo}</span>
                      </span>
                      <span className="cartao-meta">
                        {s.exercicios.length} {s.exercicios.length === 1 ? 'exercício' : 'exercícios'}
                        {series > 0 && ` · ${series} ${series === 1 ? 'série' : 'séries'}`}
                      </span>
                    </span>
                    <span className="seta-abre" data-aberto={aberto === chave} aria-hidden="true">›</span>
                  </button>
                  {aberto === chave && (
                    <div className="feito-detalhe">
                      {s.exercicios.map((e, j) => (
                        <div className="feito-ex" key={`${j}-${e.nome}`}>
                          <span className="feito-ex-nome">{e.nome}</span>
                          <span className="feito-ex-series">{linhaDeSeries(e)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {dia.cardios.map((c, i) => (
              <div className="feito-cardio" key={`${dia.data}|${c.aparelho}|${i}`}>
                <span className="feito-cardio-nome">{c.aparelho || 'cardio'}</span>
                <span className="feito-cardio-meta">
                  {c.minutos > 0 && `${c.minutos} min`}
                  {c.distancia !== null && ` · ${c.distancia} km`}
                  {c.pace && ` · ${c.pace}`}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
