import { useEffect, useMemo, useState } from 'react'
import type { NoteComCampos } from '../tipos'
import { feriadosDoAno, type Feriado } from '../../shared/feriados'
import { diasNoMes as diasDoMesNoAno } from '../../shared/datas'
import { Linha, txt } from './base'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * O que dá para criar direto de um dia do calendário.
 *
 * Os mesmos quatro que o calendário mostra. Consulta, cardio e medida saíram
 * junto com as notas: marcar ali algo que o calendário não desenha criaria uma
 * nota que some da própria tela onde foi criada.
 */
const CRIAVEIS = [
  { tipo: 'evento', nome: 'Compromisso' },
  { tipo: 'prova', nome: 'Prova' },
  { tipo: 'tarefa', nome: 'Tarefa' },
  { tipo: 'data-comemorativa', nome: 'Data comemorativa' }
]

/** Os tipos com data marcada que o calendário mostra. A data comemorativa vem à parte. */
const TIPOS_DO_CALENDARIO = new Set(['evento', 'prova', 'simulado', 'tarefa'])

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

const ONDE: Record<Feriado['abrangencia'], string> = {
  nacional: 'Nacional',
  estadual: 'Estadual (SP)',
  municipal: 'Municipal (Campinas)'
}

/**
 * O feriado descrito em uma linha: onde vale, e de que espécie é.
 *
 * "Municipal · feriado" e "Nacional · ponto facultativo" dizem coisas
 * diferentes sobre o mesmo quadradinho do calendário — a segunda depende de
 * decreto do ano. É a diferença entre um prazo que corre e um que não corre,
 * e por isso ela aparece escrita, e não só numa cor.
 */
function legenda(f: Feriado): string {
  return `${ONDE[f.abrangencia]} · ${f.especie === 'feriado' ? 'feriado' : 'ponto facultativo'}`
}

/**
 * O que aparece em cada dia do ano que a grade mostra.
 *
 * Só compromissos, provas, tarefas e datas comemorativas — a pedido do dono.
 * Antes o calendário lia o `date:` de QUALQUER nota, e anotação, medida,
 * treino feito e movimento do porquinho enchiam os quadradinhos e enterravam
 * o que tem hora para acontecer.
 *
 * A data comemorativa não tem `date`: tem dia e mês, e cai todo ano. Aparece no
 * dia dela do ano da grade; 29/02 em ano comum cai em 28/02, como no resto do
 * app, e um dia que não existe em mês nenhum (31/04) não aparece.
 */
export function porDiaDoCalendario(notas: NoteComCampos[], ano: number): Map<string, NoteComCampos[]> {
  const m = new Map<string, NoteComCampos[]>()
  const por = (data: string, n: NoteComCampos): void => {
    const atual = m.get(data)
    if (atual) atual.push(n)
    else m.set(data, [n])
  }
  for (const n of notas) {
    if (n.tipo === 'data-comemorativa') {
      const dia = Number(n.campos.dia)
      const mes = Number(n.campos.mes)
      if (!Number.isInteger(dia) || !Number.isInteger(mes) || mes < 1 || mes > 12 || dia < 1) continue
      if (dia > diasDoMesNoAno(mes, 2024)) continue
      por(iso(ano, mes - 1, Math.min(dia, diasDoMesNoAno(mes, ano))), n)
      continue
    }
    if (!n.date || !TIPOS_DO_CALENDARIO.has(n.tipo)) continue
    por(n.date, n)
  }
  return m
}

/**
 * Grade mensal. Clicar num dia abre o popup daquele dia: o que está marcado,
 * e os botões para marcar mais uma coisa ali.
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

  const porDia = useMemo(() => porDiaDoCalendario(notas, ano), [notas, ano])

  /*
   * Os feriados do ano na tela.
   *
   * Calculados, não lidos do vault — ver `shared/feriados`. Um mês pode
   * mostrar dias do ano seguinte na última linha? Não: a grade só habilita
   * dias do próprio mês, então um ano por vez basta.
   */
  const feriados = useMemo(() => feriadosDoAno(ano), [ano])

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
  const feriadosDoDia = dia ? feriados.get(dia) ?? [] : []
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
          // O primeiro basta para pintar a célula; o popup mostra todos.
          const feriado = c.data ? feriados.get(c.data)?.[0] : undefined
          // Com feriado cabe um compromisso a menos: a célula tem altura fixa,
          // e a quarta linha vazaria por baixo da borda.
          const cabem = feriado ? 2 : 3
          return (
            <button
              key={i}
              className="cal-dia"
              data-fora={c.foraDoMes}
              data-hoje={c.data === hoje}
              data-sel={c.data !== null && c.data === dia}
              data-feriado={feriado?.especie}
              disabled={c.foraDoMes}
              title={feriado ? `${feriado.nome} — ${legenda(feriado)}` : c.data ? 'Clique para ver e marcar' : undefined}
              onClick={() => c.data && setDia(c.data)}
            >
              <span className="cal-num">{c.dia}</span>
              {feriado && <span className="cal-feriado">{feriado.nome}</span>}
              {eventos.slice(0, cabem).map(e => (
                // O título corta na célula, que tem tamanho fixo. Passar o mouse
                // mostra ele inteiro; clicar abre o dia com todas as notas.
                <span key={e.path} className="cal-chip" data-t={e.tipo} title={e.title}>
                  {e.title}
                </span>
              ))}
              {eventos.length > cabem && <span className="cal-mais">+{eventos.length - cabem}</span>}
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
              {/* O feriado vem antes do que está marcado: é a informação que
                  muda o sentido de tudo o que vier depois na mesma tela. A
                  lei fica visível porque é ela que responde "e por que este
                  dia é feriado, e aquele não?". */}
              {feriadosDoDia.map(f => (
                <div key={f.nome} className="popup-feriado" data-e={f.especie}>
                  <strong>{f.nome}</strong>
                  <span>{legenda(f)}</span>
                  <span className="popup-feriado-lei">{f.lei}</span>
                </div>
              ))}
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
                    onClick={() => {
                      // A data comemorativa guarda dia e mês, não uma data: o
                      // ano de algo que se repete é quando começou.
                      aoAdicionar(c.tipo, c.tipo === 'data-comemorativa'
                        ? { dia: Number(dia.slice(8, 10)), mes: Number(dia.slice(5, 7)) }
                        : { date: dia })
                      setDia(null)
                    }}
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
