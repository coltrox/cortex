import { useEffect, useState } from 'react'
import type { NoteComCampos } from '../tipos'
import { num } from './base'

/**
 * Pomodoro da lente Estudos.
 *
 * O relógio mora no módulo, e não no componente: trocar de aba (ou de lente)
 * desmonta a tela, e um temporizador que zera porque você foi olhar a agenda
 * não serve para nada. A tela só assina o estado.
 *
 * Cada foco concluído soma minutos no diário do dia (`estudo_minutos`) e um
 * pomodoro (`pomodoros`) — o mesmo arquivo que já guarda as tarefas feitas,
 * gravado pelo mesmo `aoMarcarDia`. Pausa não conta.
 */

export type Fase = 'foco' | 'pausa' | 'pausa-longa'

type Estado = {
  fase: Fase
  /** Quando a fase acaba (ms desde a época), ou null se está parado. */
  fimEm: number | null
  /** Quanto falta, em ms, enquanto está parado. */
  restante: number
  /** Focos concluídos desde que o ciclo começou (a cada 4, pausa longa). */
  ciclos: number
}

const DURACOES_PADRAO: Record<Fase, number> = { foco: 25, pausa: 5, 'pausa-longa': 15 }

let duracoes = { ...DURACOES_PADRAO }
let estado: Estado = { fase: 'foco', fimEm: null, restante: duracoes.foco * 60_000, ciclos: 0 }
const ouvintes = new Set<() => void>()
/** Quem grava no diário quando um foco termina. A tela registra ao montar. */
let aoConcluirFoco: ((minutos: number) => void) | null = null
let relogio: ReturnType<typeof setInterval> | null = null

function emitir(novo: Estado): void {
  estado = novo
  for (const o of ouvintes) o()
}

/** A próxima fase depois de uma. A cada quatro focos, a pausa é longa. */
export function proximaFase(fase: Fase, ciclos: number): { fase: Fase; ciclos: number } {
  if (fase !== 'foco') return { fase: 'foco', ciclos }
  const feitos = ciclos + 1
  return { fase: feitos % 4 === 0 ? 'pausa-longa' : 'pausa', ciclos: feitos }
}

export function formatarRelogio(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function tocar(): void {
  // Um bipe curto, gerado na hora: sem arquivo de áudio para empacotar.
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()
    osc.frequency.value = 880
    vol.gain.setValueAtTime(0.15, ctx.currentTime)
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    osc.connect(vol).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
    osc.onended = () => void ctx.close()
  } catch { /* sem áudio, sem bipe */ }
}

function avancar(): void {
  const eraFoco = estado.fase === 'foco'
  const { fase, ciclos } = proximaFase(estado.fase, estado.ciclos)
  if (eraFoco) aoConcluirFoco?.(duracoes.foco)
  tocar()
  // A fase seguinte já começa andando: parar entre foco e pausa é o que faz
  // a pausa de cinco minutos virar meia hora.
  const ms = duracoes[fase] * 60_000
  emitir({ fase, ciclos, restante: ms, fimEm: Date.now() + ms })
}

function ligarRelogio(): void {
  if (relogio) return
  relogio = setInterval(() => {
    if (estado.fimEm === null) return
    if (Date.now() >= estado.fimEm) avancar()
    else for (const o of ouvintes) o()
  }, 250)
}

const pomodoro = {
  iniciar(): void {
    ligarRelogio()
    emitir({ ...estado, fimEm: Date.now() + estado.restante })
  },
  pausar(): void {
    if (estado.fimEm === null) return
    emitir({ ...estado, restante: Math.max(0, estado.fimEm - Date.now()), fimEm: null })
  },
  zerar(): void {
    emitir({ fase: 'foco', fimEm: null, restante: duracoes.foco * 60_000, ciclos: 0 })
  },
  pular(): void {
    // Pular não conta como foco feito: não grava nada no diário.
    const { fase, ciclos } = proximaFase(estado.fase, estado.ciclos)
    emitir({ fase, ciclos, restante: duracoes[fase] * 60_000, fimEm: null })
  },
  escolher(fase: Fase): void {
    emitir({ ...estado, fase, restante: duracoes[fase] * 60_000, fimEm: null })
  },
  definirDuracao(fase: Fase, minutos: number): void {
    duracoes = { ...duracoes, [fase]: minutos }
    // Só mexe no relógio se ele está parado na fase que mudou.
    if (estado.fimEm === null && estado.fase === fase) emitir({ ...estado, restante: minutos * 60_000 })
    else emitir({ ...estado })
  }
}

const NOME_FASE: Record<Fase, string> = { foco: 'Foco', pausa: 'Pausa curta', 'pausa-longa': 'Pausa longa' }
const FASES = Object.keys(NOME_FASE) as Fase[]

export function Pomodoro({ notas, hoje, aoMarcarDia }: {
  notas: NoteComCampos[]
  hoje: string
  aoMarcarDia: (dia: string, campos: Record<string, unknown>) => void
}) {
  // O relógio avisa a cada tique; a tela só precisa redesenhar.
  const [, redesenhar] = useState(0)
  useEffect(() => {
    const o = (): void => redesenhar(x => x + 1)
    ouvintes.add(o)
    return () => { ouvintes.delete(o) }
  }, [])

  const diario = notas.find(n => n.path === `Diario/${hoje}.md`)
  const minutosHoje = num(diario?.campos.estudo_minutos)
  const pomodorosHoje = num(diario?.campos.pomodoros)

  // Quem grava fica registrado com os números atuais do diário — senão o
  // foco concluído somaria em cima de um valor velho. Continua registrado
  // quando a tela sai: o relógio segue rodando em outra lente.
  useEffect(() => {
    aoConcluirFoco = minutos => aoMarcarDia(hoje, {
      estudo_minutos: minutosHoje + minutos,
      pomodoros: pomodorosHoje + 1
    })
  }, [aoMarcarDia, hoje, minutosHoje, pomodorosHoje])

  const rodando = estado.fimEm !== null
  const restante = estado.fimEm === null ? estado.restante : Math.max(0, estado.fimEm - Date.now())
  const total = duracoes[estado.fase] * 60_000
  const pct = total ? Math.min(1, 1 - restante / total) : 0

  const R = 118
  const C = 2 * Math.PI * R

  return (
    <div className="pomodoro">
      <div className="pomodoro-fases">
        {FASES.map(f => (
          <button key={f} aria-pressed={estado.fase === f}
            className={`pomodoro-fase ${estado.fase === f ? 'ativa' : ''}`}
            onClick={() => pomodoro.escolher(f)}>
            {NOME_FASE[f]}
          </button>
        ))}
      </div>

      <div className="pomodoro-relogio" data-fase={estado.fase}>
        <svg viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r={R} className="pomodoro-trilho" />
          <circle cx="130" cy="130" r={R} className="pomodoro-arco"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <div className="pomodoro-tempo">
          <strong>{formatarRelogio(restante)}</strong>
          <span>{NOME_FASE[estado.fase]} · ciclo {(estado.ciclos % 4) + (estado.fase === 'foco' ? 1 : 0) || 4} de 4</span>
        </div>
      </div>

      <div className="pomodoro-botoes">
        {rodando
          ? <button className="btn" onClick={pomodoro.pausar}>Pausar</button>
          : <button className="btn" onClick={pomodoro.iniciar}>{restante < total ? 'Continuar' : 'Começar'}</button>}
        <button className="btn-fantasma" onClick={pomodoro.pular}>Pular</button>
        <button className="btn-fantasma" onClick={pomodoro.zerar}>Zerar</button>
      </div>

      <div className="pomodoro-hoje">
        <strong>{pomodorosHoje}</strong> {pomodorosHoje === 1 ? 'pomodoro' : 'pomodoros'} hoje
        <span className="pomodoro-sep">·</span>
        <strong>{Math.floor(minutosHoje / 60)}h{String(minutosHoje % 60).padStart(2, '0')}</strong> de foco
      </div>

      <div className="pomodoro-duracoes">
        {FASES.map(f => (
          <label key={f}>
            <span>{NOME_FASE[f]}</span>
            <input type="number" min={1} max={120} value={duracoes[f]}
              onChange={e => {
                const m = Math.round(Number(e.target.value))
                if (m >= 1 && m <= 120) pomodoro.definirDuracao(f, m)
              }} />
            <span>min</span>
          </label>
        ))}
      </div>
    </div>
  )
}
