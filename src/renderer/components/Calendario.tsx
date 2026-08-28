import { useEffect, useMemo, useState } from 'react'
import type { NoteComCampos } from '../tipos'
import { Linha, txt } from './base'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** O que dá para criar direto de um dia do calendário. */
const CRIAVEIS = [
  { tipo: 'evento', nome: 'Compromisso' },
  { tipo: 'prova', nome: 'Prova' },
  { tipo: 'consulta', nome: 'Consulta' },
  { tipo: 'tarefa', nome: 'Tarefa' },
  { tipo: 'cardio', nome: 'Cardio' },
  { tipo: 'medida', nome: 'Medida' }
]

/** Constrói ISO sem passar por Date — evita a viagem de fuso do toISOString. */
function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate()
}

function rotulo(isoData: string): string {
  const [a, m, d] = isoData.split('-').map(Number)
  return `${SEMANA[new Date(a, m - 1, d).getDay()]}, ${d} de ${MESES[m - 1]} de ${a}`
}

/**
 * Grade mensal. Clicar num dia abre o popup daquele dia: o que está marcado,
 * e os botões para marcar mais uma coisa ali.
 *
 * Não existe "evento" como entidade privilegiada — o calendário lê o campo
 * `date:` de qualquer nota. Prova, consulta, treino e viagem caem aqui pelo
 * mesmo caminho.
 */
export function Calendario({
  notas, hoje, aoAbrir, aoAdicionar, aoExcluir
}: {
  notas: NoteComCampos[]
  hoje: string
  aoAbrir: (p: string) => void
  aoAdicionar: (tipo: string, inicial?: Record<string, unknown>) => void
  aoExcluir: (n: NoteComCampos) => void
}) {
  const [ano, setAno] = useState(() => Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(() => Number(hoje.slice(5, 7)) - 1)
  const [dia, setDia] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setDia(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const porDia = useMemo(() => {
    const m = new Map<string, NoteComCampos[]>()
    for (const n of notas) {
      if (!n.date) continue
      // O diário do dia é o arquivo de trabalho do app, não um compromisso:
      // ele apareceria em todo santo dia da grade e enterraria o que importa.
      if (n.tipo === 'diario') continue
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
    while (out.length % 7 !== 0) out.push({ data: null, dia: extra++, foraDoMes: true })
    return out
  }, [ano, mes])

  const mover = (delta: number): void => {
    const novo = mes + delta
    if (novo < 0) { setMes(11); setAno(a => a - 1) }
    else if (novo > 11) { setMes(0); setAno(a => a + 1) }
    else setMes(novo)
  }

  const irParaHoje = (): void => {
    setAno(Number(hoje.slice(0, 4)))
    setMes(Number(hoje.slice(5, 7)) - 1)
    setDia(hoje)
  }

  const doDia = dia ? porDia.get(dia) ?? [] : []
  const noMes = celulas
    .filter(c => c.data)
    .reduce((s, c) => s + (porDia.get(c.data as string)?.length ?? 0), 0)

  return (
    <div className="cal">
      <div className="cal-topo">
        <h2 className="cal-mes">{MESES[mes]} <span>{ano}</span></h2>
        <div className="cal-nav">
          <span className="cal-conta">{noMes} {noMes === 1 ? 'registro' : 'registros'}</span>
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
              data-sel={c.data !== null && c.data === dia}
              disabled={c.foraDoMes}
              title={c.data ? 'Clique para ver e marcar' : undefined}
              onClick={() => c.data && setDia(c.data)}
            >
              <span className="cal-num">{c.dia}</span>
              {eventos.slice(0, 3).map(e => (
                <span key={e.path} className="cal-chip" data-t={e.tipo}>{e.title}</span>
              ))}
              {eventos.length > 3 && <span className="cal-mais">+{eventos.length - 3}</span>}
            </button>
          )
        })}
      </div>

      {dia && (
        <div className="paleta-fundo" onClick={() => setDia(null)}>
          <div className="popup-dia" onClick={e => e.stopPropagation()}>
            <div className="popup-topo">
              <strong>{rotulo(dia)}</strong>
              {dia === hoje && <span className="tipo">hoje</span>}
              <button className="btn-icone" title="Fechar" onClick={() => setDia(null)}>×</button>
            </div>

            <div className="popup-corpo">
              {doDia.length === 0 ? (
                <div className="vazio">Nada marcado neste dia.</div>
              ) : (
                <div className="lista-notas">
                  {doDia.map(n => (
                    <Linha
                      key={n.path}
                      aoAbrir={() => { aoAbrir(n.path); setDia(null) }}
                      aoExcluir={() => aoExcluir(n)}
                    >
                      {txt(n.campos.hora) && <span className="linha-data">{txt(n.campos.hora)}</span>}
                      <span className="linha-titulo">{n.title}</span>
                      {txt(n.campos.local) && <span className="linha-valor">{txt(n.campos.local)}</span>}
                      <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
                    </Linha>
                  ))}
                </div>
              )}
            </div>

            <div className="popup-rodape">
              <span className="form-rotulo">Marcar neste dia</span>
              <div className="chips">
                {CRIAVEIS.map(c => (
                  <button
                    key={c.tipo}
                    className="chip"
                    onClick={() => { aoAdicionar(c.tipo, { date: dia }); setDia(null) }}
                  >
                    + {c.nome}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
