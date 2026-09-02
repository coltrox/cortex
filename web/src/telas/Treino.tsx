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
      <div className="tema-treino">
        <Cabecalho titulo="Treino" aoVoltar={() => p.irPara('hoje')} />
        {modelos.length === 0 && (
          <Aviso titulo="Nenhum treino ainda">
            Cadastre um treino no Cortex — ele aparece aqui sozinho.
          </Aviso>
        )}
        <div className="bloco">
          <div className="lista">
            {modelos.map(m => {
              const n = exerciciosDoTreino(m).length
              const grupo = typeof m.detalhe.grupo === 'string' ? m.detalhe.grupo : ''
              return (
                <button key={m.nome} className="cartao" type="button"
                  onClick={() => setEscolhido(m.nome)}>
                  <span className="cartao-corpo">
                    <span className="cartao-topo">
                      <span className="cartao-nome">{m.nome}</span>
                      {grupo && <span className="etiqueta">{grupo}</span>}
                    </span>
                    <span className="cartao-meta">
                      {n} {n === 1 ? 'exercício' : 'exercícios'}
                    </span>
                  </span>
                  <svg className="seta" width="18" height="18" viewBox="0 0 18 18" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6.5 3.5 5.5 5.5-5.5 5.5" />
                  </svg>
                </button>
              )
            })}
          </div>
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

  const porcento = exercicios.length ? (prontos / exercicios.length) * 100 : 0

  return (
    <div className="tema-treino">
      <Cabecalho
        titulo={modelo.nome}
        aoVoltar={() => { setEscolhido(null); setFeitos([]) }}
        direita={<span className="contador-serie">{prontos}/{exercicios.length}</span>}
      />

      {/* A barra é a única coisa que responde a cada toque no treino inteiro.
          Ela existe para dar a sensação de avanço, que é o que faz terminar. */}
      <div className="progresso"><i style={{ width: `${porcento}%` }} /></div>

      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="bloco">
        {exercicios.length === 0 && (
          <p className="secao-vazia">Este treino ainda não tem exercícios cadastrados no Cortex.</p>
        )}

        <div className="lista">
          {exercicios.map((e, i) => {
            const feito = feitos.includes(e.nome)
            return (
              <div className={`cartao-exercicio ${feito ? 'exercicio-feito' : ''}`} key={e.nome}>
                <button
                  className="exercicio-topo"
                  onClick={() => alternar(e.nome)}
                  aria-pressed={feito}
                  type="button"
                >
                  <span className="marcador">{feito ? '✓' : i + 1}</span>
                  <span>
                    <span className="exercicio-nome">{e.nome}</span>
                    {(e.series || e.reps) && (
                      <span className="exercicio-presc">
                        {e.series ?? '—'} × {e.reps ?? '—'}
                      </span>
                    )}
                  </span>
                </button>

                <div className="peso">
                  <button className="peso-passo" type="button"
                    onClick={() => mexer(e.nome, -2.5)}
                    aria-label={`tirar 2,5 kg de ${e.nome}`}>−</button>
                  <input
                    className="peso-campo"
                    type="text"
                    inputMode="decimal"
                    value={cargas[e.nome] ?? ''}
                    placeholder="0 kg"
                    aria-label={`carga de ${e.nome} em kg`}
                    onChange={ev => setCargas(c => ({
                      ...c, [e.nome]: ev.target.value.replace(',', '.')
                    }))}
                  />
                  <button className="peso-passo" type="button"
                    onClick={() => mexer(e.nome, 2.5)}
                    aria-label={`somar 2,5 kg em ${e.nome}`}>+</button>
                </div>
              </div>
            )
          })}
        </div>
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
