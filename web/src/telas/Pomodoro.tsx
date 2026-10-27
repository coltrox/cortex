import { useEffect, useRef, useState } from 'react'
import { Botao } from '../componentes'
import {
  DURACOES_PADRAO, formatarRelogio, nomeDaFase, proximaFase, type Fase
} from '@compartilhado/pomodoro'

/**
 * O pomodoro, no celular.
 *
 * Pedido dele, ao pé da letra: "tem que aparecer o Pomodoro também no mobile",
 * e — importante — "é uma ferramenta a mais que eu vou utilizar separado". Por
 * isso ele NÃO se mistura com o cronômetro da sessão de estudo: a sessão mede
 * o estudo inteiro e grava a nota da sessão; o pomodoro é só o ciclo de foco e
 * pausa, e não grava nada.
 *
 * O relógio é calculado a partir de um INSTANTE DE FIM, e não por contagem de
 * ticks. No celular a aba fica em segundo plano e o navegador segura os
 * temporizadores: contando ticks, voltar para a tela mostraria um relógio
 * atrasado. Com instante de fim, ele só lê a hora atual e acerta sozinho.
 */
export function PomodoroMovel({ aoVoltar }: { aoVoltar: () => void }) {
  const [fase, setFase] = useState<Fase>('foco')
  const [ciclos, setCiclos] = useState(0)
  /** Quando esta fase termina. `null` quando está parado. */
  const [fimEm, setFimEm] = useState<number | null>(null)
  /** O que falta, enquanto está parado. */
  const [restante, setRestante] = useState(DURACOES_PADRAO.foco * 60_000)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (fimEm === null) return
    const t = setInterval(() => setAgora(Date.now()), 250)
    return () => clearInterval(t)
  }, [fimEm])

  const falta = fimEm === null ? restante : Math.max(0, fimEm - agora)

  /* O bipe do fim da fase, gerado na hora: sem arquivo de áudio para o app
     carregar. Em iOS, o navegador só deixa tocar depois de um toque na tela —
     e aqui sempre houve um, porque o ciclo começou num clique. */
  const tocar = (): void => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as {
        webkitAudioContext?: typeof AudioContext
      }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = 880
      vol.gain.value = 0.08
      osc.connect(vol).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.18)
    } catch { /* sem som é melhor que quebrar o pomodoro */ }
  }

  /* `useRef` para não disparar a virada duas vezes no mesmo instante: o
     intervalo roda a cada 250 ms e o efeito veria `falta` em zero várias vezes. */
  const virando = useRef(false)
  useEffect(() => {
    if (fimEm === null || falta > 0 || virando.current) return
    virando.current = true
    tocar()
    const prox = proximaFase(fase, ciclos)
    setFase(prox.fase)
    setCiclos(prox.ciclos)
    /* Para no fim de cada fase, de propósito: começar a pausa sozinha faz a
       pausa de cinco minutos virar meia hora, porque ninguém está olhando. */
    setFimEm(null)
    setRestante(DURACOES_PADRAO[prox.fase] * 60_000)
    virando.current = false
  }, [falta, fimEm, fase, ciclos])

  const comecar = (): void => setFimEm(Date.now() + falta)
  const pausar = (): void => { setRestante(falta); setFimEm(null) }
  const zerar = (): void => {
    setFimEm(null)
    setRestante(DURACOES_PADRAO[fase] * 60_000)
  }
  const pular = (): void => {
    const prox = proximaFase(fase, ciclos)
    setFase(prox.fase)
    setCiclos(prox.ciclos)
    setFimEm(null)
    setRestante(DURACOES_PADRAO[prox.fase] * 60_000)
  }

  const rodando = fimEm !== null

  return (
    <div className="bloco">
      {/* Sem título aqui: o cabeçalho da tela já diz "Pomodoro", e as duas
          linhas iguais, uma embaixo da outra, só ocupavam o alto da tela. */}
      <div className="pomo" data-fase={fase}>
        <span className="pomo-fase">{nomeDaFase(fase)}</span>
        <strong className="pomo-relogio">{formatarRelogio(falta)}</strong>
        <span className="pomo-ciclos">
          {ciclos === 0 ? 'nenhum foco ainda' : `${ciclos} ${ciclos === 1 ? 'foco' : 'focos'} hoje`}
        </span>
      </div>

      <div className="pomo-botoes">
        <Botao tipo="principal" aoClicar={rodando ? pausar : comecar}>
          {rodando ? 'Pausar' : falta === DURACOES_PADRAO[fase] * 60_000 ? 'Começar' : 'Continuar'}
        </Botao>
        <Botao tipo="secundario" aoClicar={zerar}>Zerar</Botao>
        <Botao tipo="secundario" aoClicar={pular}>Pular fase</Botao>
      </div>

      <p className="treino-dica">
        Foco de {DURACOES_PADRAO.foco} min, pausa de {DURACOES_PADRAO.pausa} min e,
        a cada quatro focos, pausa longa de {DURACOES_PADRAO['pausa-longa']} min.
        O pomodoro é separado do cronômetro da sessão de estudo.
      </p>

      <Botao tipo="secundario" aoClicar={aoVoltar}>Voltar</Botao>
    </div>
  )
}
