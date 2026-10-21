import { useMemo, useRef, useState } from 'react'
import type { NoteComCampos } from '../tipos'
import { figuraSegura } from '../../shared/figura'

/**
 * Treinar exercício no computador — o mesmo gesto do celular.
 *
 * Pedido dele: "quero uma aba só para exercícios... pra eu ter acesso para
 * fazer exercícios igual o app web".
 *
 * Diferente do simulado, que é a prova inteira, cronometrada e corrigida no
 * fim: aqui é uma questão por vez, com correção na hora e a fórmula logo
 * depois de responder. É o flashcard, não a prova.
 *
 * O histórico decide qual questão volta antes e mora no `localStorage` desta
 * máquina. Ele não conversa com o do celular, e tudo bem: o registro que vale
 * é a nota de sessão no vault, não o contador de sorteio.
 */

type Questao = {
  n?: number
  materia?: string
  enunciado?: string
  a?: string; b?: string; c?: string; d?: string; e?: string
  gabarito?: string
  comentario?: string
  formulas?: string[]
  figura?: string
}

/** Uma questão com a nota de onde saiu. */
type Carta = {
  chave: string
  origem: string
  materia: string
  questao: Questao
}

type Marca = { acertos: number; erros: number }
type Historico = Record<string, Marca>

const CHAVE = 'cortex.treino'
const LETRAS = ['a', 'b', 'c', 'd', 'e'] as const

const txt = (v: unknown): string => (typeof v === 'string' ? v : '')

function lerHistorico(): Historico {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const o: unknown = bruto ? JSON.parse(bruto) : null
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Historico = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const m = v as Record<string, unknown>
      out[k] = {
        acertos: typeof m.acertos === 'number' ? m.acertos : 0,
        erros: typeof m.erros === 'number' ? m.erros : 0
      }
    }
    return out
  } catch {
    // Dado torto ou armazenamento bloqueado: treinar sem histórico é melhor
    // do que não abrir a aba.
    return {}
  }
}

function gravarHistorico(h: Historico): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(h))
  } catch {
    // Sem espaço: o treino segue, só não lembra a ordem na próxima vez.
  }
}

/**
 * As cartas do baralho.
 *
 * Só notas de conteúdo (`materia`). As questões que moram num DIA do
 * cronograma ficam de fora, pela mesma razão do celular: "exercício de
 * cronograma é para ser feito de acordo com os meus estudos do cronograma".
 */
export function cartasDasNotas(notas: NoteComCampos[]): Carta[] {
  const out: Carta[] = []
  for (const nota of notas) {
    if (nota.tipo !== 'materia') continue
    const cru = nota.campos?.questoes
    if (!Array.isArray(cru)) continue
    const titulo = txt(nota.campos?.titulo) || txt(nota.title)
    ;(cru as Questao[]).forEach((q, i) => {
      if (!q?.enunciado || !q?.gabarito) return
      if (LETRAS.filter(l => q[l]).length < 2) return
      out.push({
        chave: `${titulo}#${q.n ?? i + 1}`,
        origem: titulo,
        materia: txt(q.materia) || txt(nota.campos?.materia),
        questao: q
      })
    })
  }
  return out
}

/**
 * Quanto uma carta merece aparecer agora. Maior vem primeiro.
 *
 * Nunca vista primeiro, depois o que ele erra, e por último o que já acerta —
 * a mesma ordem do celular, porque é a ordem em que se deve estudar.
 */
export function peso(c: Carta, h: Historico): number {
  const m = h[c.chave]
  if (!m) return 1000
  return 100 + m.erros * 10 - m.acertos * 5
}

export function sortear(cartas: Carta[], h: Historico, sorteio = Math.random): Carta | undefined {
  return cartas
    .map(c => ({ c, p: peso(c, h) + sorteio() }))
    .sort((x, y) => y.p - x.p)[0]?.c
}

function Figura({ svg }: { svg?: string }) {
  const seguro = figuraSegura(svg)
  if (!seguro) return null
  return <div className="prova-figura" role="img" dangerouslySetInnerHTML={{ __html: seguro }} />
}

export function TreinoExercicios({ notas }: { notas: NoteComCampos[] }) {
  const [historico, setHistorico] = useState<Historico>(() => lerHistorico())
  const [materia, setMateria] = useState<string | null>(null)
  const [marcada, setMarcada] = useState<string | null>(null)
  const [rodada, setRodada] = useState(0)

  const todas = useMemo(() => cartasDasNotas(notas), [notas])
  const materias = useMemo(
    () => [...new Set(todas.map(c => c.materia).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [todas]
  )

  /* O histórico num ref para o sorteio ler o valor atual sem virar
     dependência: se virasse, responder trocaria a questão na cara dele —
     foi um bug feio no celular, e não vale repetir aqui. */
  const historicoRef = useRef(historico)
  historicoRef.current = historico

  const atual = useMemo(
    () => sortear(materia ? todas.filter(c => c.materia === materia) : todas, historicoRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todas, materia, rodada]
  )

  if (todas.length === 0) {
    return (
      <p className="vazio">
        Nenhuma questão por aqui ainda. Os exercícios moram no campo
        <code> questoes </code> das notas de conteúdo, em Estudos/Conteudos.
      </p>
    )
  }

  const q = atual?.questao
  const acertou = marcada !== null && marcada === q?.gabarito
  const disponiveis = LETRAS.filter(l => q?.[l])

  const responder = (letra: string): void => {
    if (!atual || marcada) return
    setMarcada(letra)
    const m = historico[atual.chave] ?? { acertos: 0, erros: 0 }
    const certo = letra === atual.questao.gabarito
    const h = {
      ...historico,
      [atual.chave]: {
        acertos: m.acertos + (certo ? 1 : 0),
        erros: m.erros + (certo ? 0 : 1)
      }
    }
    gravarHistorico(h)
    setHistorico(h)
  }

  /** "Cliquei sem querer": desfaz a resposta e devolve a questão em branco. */
  const contestar = (): void => {
    if (!atual || marcada === null) return
    const m = historico[atual.chave]
    if (m) {
      const certo = marcada === atual.questao.gabarito
      const novo = {
        acertos: Math.max(0, m.acertos - (certo ? 1 : 0)),
        erros: Math.max(0, m.erros - (certo ? 0 : 1))
      }
      const h = { ...historico }
      if (novo.acertos === 0 && novo.erros === 0) delete h[atual.chave]
      else h[atual.chave] = novo
      gravarHistorico(h)
      setHistorico(h)
    }
    setMarcada(null)
  }

  const proxima = (): void => { setMarcada(null); setRodada(r => r + 1) }

  return (
    <div className="treino-pc">
      <div className="chips">
        <button
          type="button" className="chip" data-ativo={materia === null || undefined}
          onClick={() => { setMateria(null); proxima() }}
        >Tudo</button>
        {materias.map(m => (
          <button
            key={m} type="button" className="chip" data-ativo={materia === m || undefined}
            onClick={() => { setMateria(m); proxima() }}
          >{m}</button>
        ))}
      </div>

      {!atual ? (
        <p className="vazio">Nenhuma questão desta matéria.</p>
      ) : (
        <div className="card">
          <div className="card-topo">
            <strong>{atual.origem}</strong>
            {atual.materia && <span className="chip">{atual.materia}</span>}
          </div>

          <p className="prova-enunciado">{q?.enunciado}</p>
          <Figura svg={q?.figura} />

          <div className="prova-alternativas">
            {disponiveis.map(l => {
              const estado = marcada === null
                ? undefined
                : l === q?.gabarito ? 'certa'
                  : l === marcada ? 'errada' : undefined
              return (
                <button
                  key={l}
                  type="button"
                  className="prova-alternativa"
                  data-estado={estado}
                  disabled={marcada !== null}
                  onClick={() => responder(l)}
                >
                  <span className="prova-letra">{l.toUpperCase()}</span>
                  <span>{q?.[l]}</span>
                </button>
              )
            })}
          </div>

          {marcada !== null && (
            <>
              <div className="prova-correcao" data-acertou={acertou || undefined}>
                <strong>
                  {acertou ? 'Acertou.' : `Resposta: ${(q?.gabarito ?? '').toUpperCase()}`}
                </strong>
                {q?.comentario && <p>{q.comentario}</p>}
                {q?.formulas && q.formulas.length > 0 && (
                  <div className="treino-formulas">
                    <span className="treino-formulas-rotulo">
                      {q.formulas.length === 1 ? 'Fórmula usada' : 'Fórmulas usadas'}
                    </span>
                    <ul>{q.formulas.map(f => <li key={f}><code>{f}</code></li>)}</ul>
                  </div>
                )}
              </div>

              <div className="linha-botoes">
                <button className="btn primario" onClick={proxima}>Próxima</button>
                {/* Antes de avançar, e não depois: passada a questão, não há
                    como voltar para corrigir o clique. */}
                <button className="btn" onClick={contestar}>Cliquei sem querer</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
