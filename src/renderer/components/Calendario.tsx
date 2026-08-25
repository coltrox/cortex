import { useMemo, useState } from 'react'
import type { NoteComCampos } from '../tipos'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Constrói ISO sem passar por Date — evita a viagem de fuso do toISOString. */
function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate()
}

/**
 * Grade mensal. Cada célula é um dia; clicar seleciona e abre o painel do dia.
 *
 * Não existe "evento" como entidade — o calendário lê o campo `date:` de
 * qualquer nota. Prova, consulta, treino e viagem caem aqui pelo mesmo caminho.
 */
export function Calendario({
  notas, hoje, aoAbrir
}: { notas: NoteComCampos[]; hoje: string; aoAbrir: (p: string) => void }) {
  const [ano, setAno] = useState(() => Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(() => Number(hoje.slice(5, 7)) - 1)
  const [selecionado, setSelecionado] = useState<string | null>(hoje)

  const porDia = useMemo(() => {
    const m = new Map<string, NoteComCampos[]>()
    for (const n of notas) {
      if (!n.date) continue
      const atual = m.get(n.date)
      if (atual) atual.push(n)
      else m.set(n.date, [n])
    }
    return m
  }, [notas])

  const celulas = useMemo(() => {
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
    const total = diasNoMes(ano, mes)
    const antes = diasNoMes(ano, mes === 0 ? 11 : mes - 1)
    const out: { data: string | null; dia: number; foraDoMes: boolean }[] = []

    for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
      out.push({ data: null, dia: antes - i, foraDoMes: true })
    }
    for (let d = 1; d <= total; d++) {
      out.push({ data: iso(ano, mes, d), dia: d, foraDoMes: false })
    }
    let extra = 1
    while (out.length % 7 !== 0) {
      out.push({ data: null, dia: extra++, foraDoMes: true })
    }
    return out
  }, [ano, mes])

  const mover = (delta: number) => {
    const novo = mes + delta
    if (novo < 0) { setMes(11); setAno(a => a - 1) }
    else if (novo > 11) { setMes(0); setAno(a => a + 1) }
    else setMes(novo)
  }

  const irParaHoje = () => {
    setAno(Number(hoje.slice(0, 4)))
    setMes(Number(hoje.slice(5, 7)) - 1)
    setSelecionado(hoje)
  }

  const doDia = selecionado ? porDia.get(selecionado) ?? [] : []

  return (
    <div className="cal">
      <div className="cal-topo">
        <h2 className="cal-mes">{MESES[mes]} <span>{ano}</span></h2>
        <div className="cal-nav">
          <button className="btn-fantasma" onClick={irParaHoje}>Hoje</button>
          <button className="cal-seta" onClick={() => mover(-1)} title="Mês anterior">‹</button>
          <button className="cal-seta" onClick={() => mover(1)} title="Próximo mês">›</button>
        </div>
      </div>

      <div className="cal-semana">
        {SEMANA.map(d => <div key={d}>{d}</div>)}
      </div>

      <div className="cal-grade">
        {celulas.map((c, i) => {
          const eventos = c.data ? porDia.get(c.data) ?? [] : []
          return (
            <button
              key={i}
              className="cal-dia"
              data-fora={c.foraDoMes}
              data-hoje={c.data === hoje}
              data-sel={c.data !== null && c.data === selecionado}
              disabled={c.foraDoMes}
              onClick={() => c.data && setSelecionado(c.data)}
            >
              <span className="cal-num">{c.dia}</span>
              {eventos.slice(0, 3).map(e => (
                <span key={e.path} className="cal-chip" data-t={e.tipo}>{e.title}</span>
              ))}
              {eventos.length > 3 && (
                <span className="cal-mais">+{eventos.length - 3}</span>
              )}
            </button>
          )
        })}
      </div>

      {selecionado && (
        <div className="cal-painel">
          <div className="cal-painel-data">
            {selecionado}{selecionado === hoje ? ' · hoje' : ''}
            <span>{doDia.length} {doDia.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          {doDia.length === 0 && <div className="vazio">Nada marcado neste dia.</div>}
          <div className="lista-notas">
            {doDia.map(n => (
              <button key={n.path} className="linha" onClick={() => aoAbrir(n.path)}>
                <span className="linha-titulo">{n.title}</span>
                <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
