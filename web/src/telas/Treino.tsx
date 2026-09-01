import { useState } from 'react'
import { diaLocal, eventoSessao, type ExercicioFeito } from '../montar'
import { treinos, exerciciosDoTreino } from '../cardapio'
import { Cabecalho, Botao, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/**
 * A tela do treino.
 *
 * Duas etapas: escolher, e fazer. A segunda é a que importa, porque é a que
 * fica aberta com o celular apoiado no banco do supino, entre uma série e
 * outra — daí ela ser uma lista de cartões grandes, com o peso ajustável por
 * botão em vez de teclado.
 *
 * Marcar o exercício como feito é só visual: o que sobe é a carga de todos,
 * junto, ao registrar. Mas riscar o que já passou é o que permite olhar de
 * relance e saber onde parou, que é a pergunta real no meio de um treino.
 */
export function Treino(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const modelos = treinos(p.cardapio.cardapio)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  // A carga é o único dado que o celular acrescenta: o Cortex publica séries e
  // reps, e de propósito não publica carga — ela é histórico, não estrutura.
  const [cargas, setCargas] = useState<Record<string, string>>({})
  const [feitos, setFeitos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const modelo = modelos.find(m => m.nome === escolhido)

  /* ---------- etapa 1: escolher ---------- */

  if (!modelo) {
    return (
      <div className="tela treino">
        <Cabecalho titulo="Treino" aoVoltar={() => p.irPara('hoje')} />
        {modelos.length === 0 && (
          <Aviso>
            Nenhum treino ainda. Cadastre um no Cortex — ele aparece aqui sozinho.
          </Aviso>
        )}
        <div className="secao">
          {modelos.map(m => {
            const n = exerciciosDoTreino(m).length
            const grupo = typeof m.detalhe.grupo === 'string' ? m.detalhe.grupo : ''
            return (
              <button key={m.nome} className="modelo" onClick={() => setEscolhido(m.nome)}>
                <span className="modelo-texto">
                  <strong>{m.nome}</strong>
                  <small>
                    {grupo && <span className="tag">{grupo}</span>}
                    {n} {n === 1 ? 'exercício' : 'exercícios'}
                  </small>
                </span>
                <span className="modelo-seta" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ---------- etapa 2: fazer ---------- */

  const exercicios = exerciciosDoTreino(modelo)
  const prontos = feitos.length

  const alternar = (nome: string): void =>
    setFeitos(f => (f.includes(nome) ? f.filter(x => x !== nome) : [...f, nome]))

  /** Passo do botão de peso. 2,5 kg é a menor anilha que existe na prática. */
  const mexer = (nome: string, delta: number): void =>
    setCargas(c => {
      const atual = Number(c[nome] ?? '0')
      const novo = Math.max(0, (Number.isFinite(atual) ? atual : 0) + delta)
      // Sem casa decimal quando é inteiro: "60" lê melhor que "60.0", e é o
      // caso comum.
      return { ...c, [nome]: novo % 1 === 0 ? String(novo) : novo.toFixed(1) }
    })

  const enviar = (): void => {
    try {
      const lista: ExercicioFeito[] = exercicios.map(e => ({
        nome: e.nome,
        series: e.series,
        reps: e.reps,
        carga: cargas[e.nome] ? Number(cargas[e.nome]) : undefined
      }))
      p.envio.registrar(eventoSessao(modelo.nome, lista, diaLocal()))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tela treino">
      <Cabecalho
        titulo={modelo.nome}
        aoVoltar={() => { setEscolhido(null); setFeitos([]) }}
        direita={`${prontos}/${exercicios.length}`}
      />

      {/* A barra é a única coisa que responde a cada toque no treino inteiro.
          Ela existe para dar a sensação de avanço, que é o que faz terminar. */}
      <div className="progresso">
        <div
          className="progresso-cheio"
          style={{ width: exercicios.length ? `${(prontos / exercicios.length) * 100}%` : '0%' }}
        />
      </div>

      {erro && <Aviso grave aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="secao">
        {exercicios.length === 0 && (
          <p className="nota">Este treino ainda não tem exercícios cadastrados no Cortex.</p>
        )}

        {exercicios.map((e, i) => {
          const feito = feitos.includes(e.nome)
          return (
            <div className={`exercicio ${feito ? 'feito' : ''}`} key={e.nome}>
              <button
                className="exercicio-topo"
                onClick={() => alternar(e.nome)}
                aria-pressed={feito}
              >
                <span className="exercicio-n">{feito ? '✓' : i + 1}</span>
                <span className="exercicio-texto">
                  <strong>{e.nome}</strong>
                  {(e.series || e.reps) && (
                    <small>
                      {e.series ?? '—'} <span className="x">×</span> {e.reps ?? '—'}
                    </small>
                  )}
                </span>
              </button>

              <div className="peso">
                <button
                  className="peso-passo"
                  onClick={() => mexer(e.nome, -2.5)}
                  aria-label={`tirar 2,5 kg de ${e.nome}`}
                >−</button>
                <label className="peso-campo">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cargas[e.nome] ?? ''}
                    placeholder="0"
                    onChange={ev => setCargas(c => ({
                      ...c, [e.nome]: ev.target.value.replace(',', '.')
                    }))}
                  />
                  <span>kg</span>
                </label>
                <button
                  className="peso-passo"
                  onClick={() => mexer(e.nome, 2.5)}
                  aria-label={`somar 2,5 kg em ${e.nome}`}
                >+</button>
              </div>
            </div>
          )
        })}
      </div>

      {exercicios.length > 0 && (
        // Barra fixa: num treino de dez exercícios o botão ficaria a uma
        // rolagem inteira de distância, e ele é a razão da tela existir.
        <div className="acao-fixa">
          <Botao tipo="principal" aoClicar={enviar}>Registrar treino</Botao>
        </div>
      )}
    </div>
  )
}
