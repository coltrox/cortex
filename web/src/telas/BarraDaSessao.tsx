import { useEffect, useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import {
  lerSessao, gravarSessao, decorrido, pausar, retomar, comoRelogio,
  type SessaoEstudo
} from '../sessao'

/**
 * O cronômetro da sessão de estudos, por cima de tudo.
 *
 * Pedido dele, ao pé da letra: "fica o cronômetro na minha tela, e aí tem a
 * opção de eu pausar, de eu continuar... não necessariamente eu vou para uma
 * tela de exercícios".
 *
 * Por isso mora no App, e não na tela de treino: a sessão acompanha o
 * estudo, e estudar é também ler um conteúdo, abrir o plano do dia ou
 * consultar um repertório. Um cronômetro que só existe na tela de exercícios
 * mediria a parte errada.
 *
 * Ele **não é o pomodoro**, e os dois não se misturam — também a pedido
 * dele: "o cronômetro não interfere no Pomodoro... é uma ferramenta a mais
 * que eu vou utilizar separado". Este conta o estudo inteiro; o pomodoro
 * fatia o trabalho em blocos.
 */
export function BarraDaSessao({ aoAbrirTreino }: { aoAbrirTreino: () => void }) {
  const [sessao, setSessao] = useState<SessaoEstudo | null>(
    () => lerSessao(guardadoDoNavegador)
  )
  const [agora, setAgora] = useState(() => Date.now())

  /* Relê do armazenamento a cada segundo porque quem CRIA a sessão é a tela
     de treino, e as duas não se falam por props — a barra vive acima de
     todas as telas. É a mesma batida do relógio que o cronômetro já precisa,
     então não custa um ciclo a mais. */
  useEffect(() => {
    const t = setInterval(() => {
      setAgora(Date.now())
      setSessao(lerSessao(guardadoDoNavegador))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  if (!sessao) return null

  const pausada = sessao.pausadaEm !== undefined
  const segundos = decorrido(sessao, agora)

  const alternar = (): void => {
    const nova = pausada ? retomar(sessao, Date.now()) : pausar(sessao, Date.now())
    gravarSessao(guardadoDoNavegador, nova)
    setSessao(nova)
  }

  return (
    <div className="sessao-barra" data-pausada={pausada || undefined}>
      <button
        type="button"
        className="sessao-barra-tempo"
        onClick={aoAbrirTreino}
        title="Abrir o treino"
      >
        <span className="sessao-barra-ponto" aria-hidden="true" />
        <span className="sessao-barra-relogio">{comoRelogio(segundos)}</span>
        <span className="sessao-barra-rotulo">
          {pausada ? 'pausado' : 'estudando'}
          {sessao.respostas.length > 0 && ` · ${sessao.respostas.length} ${sessao.respostas.length === 1 ? 'questão' : 'questões'}`}
        </span>
      </button>
      <button type="button" className="sessao-barra-acao" onClick={alternar}>
        {pausada ? '▶ Continuar' : '❚❚ Pausar'}
      </button>
    </div>
  )
}
