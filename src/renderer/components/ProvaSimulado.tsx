import { useState } from 'react'
import type { NoteComCampos } from '../tipos'

/**
 * Fazer o simulado, questão por questão.
 *
 * O papel não dá o que importa: quanto tempo levou, em que matéria ele erra, e
 * o comentário na hora em que o erro ainda está fresco. Esta tela dá — e por
 * isso a prova vive como DADO na nota (`questoes` no frontmatter), e não como
 * texto corrido.
 *
 * Uma questão por vez, e não a lista inteira: na prova de verdade também é
 * assim, e ver as vinte de uma vez convida a pular para a mais fácil.
 */

type Questao = {
  n?: number
  materia?: string
  enunciado?: string
  a?: string; b?: string; c?: string; d?: string; e?: string
  gabarito?: string
  comentario?: string
}

const LETRAS = ['a', 'b', 'c', 'd', 'e'] as const

/** As questões da nota, se houver. */
export function questoesDe(nota: NoteComCampos): Questao[] {
  const q = nota.campos?.questoes
  return Array.isArray(q) ? (q as Questao[]) : []
}

/**
 * O que ele acertou, por matéria.
 *
 * Separado da tela porque é a parte que não pode errar: estatística errada
 * manda estudar a matéria errada.
 */
export function estatisticas(questoes: Questao[], respostas: Record<number, string>) {
  const porMateria = new Map<string, { certas: number; total: number }>()
  let certas = 0

  questoes.forEach((q, i) => {
    const m = q.materia ?? 'geral'
    const atual = porMateria.get(m) ?? { certas: 0, total: 0 }
    atual.total += 1
    if (respostas[i] && respostas[i] === q.gabarito) {
      atual.certas += 1
      certas += 1
    }
    porMateria.set(m, atual)
  })

  return {
    certas,
    total: questoes.length,
    // Em branco conta como erro — na prova também conta.
    emBranco: questoes.filter((_, i) => !respostas[i]).length,
    porMateria: [...porMateria.entries()]
      .map(([materia, v]) => ({ materia, ...v, pct: Math.round((v.certas / v.total) * 100) }))
      // Pior primeiro; empate desempata por nome, para a lista nao trocar de
      // ordem sozinha entre um simulado e outro.
      .sort((a, b) => a.pct - b.pct || a.materia.localeCompare(b.materia))
  }
}

export function ProvaSimulado({ nota, aoSair, aoGravar }: {
  nota: NoteComCampos
  aoSair: () => void
  aoGravar: (campos: Record<string, unknown>) => void
}) {
  const questoes = questoesDe(nota)
  const [atual, setAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<number, string>>({})
  const [corrigido, setCorrigido] = useState(false)
  /* O relógio começa quando a tela abre: o tempo é metade do treino, e
     perguntar "quer começar?" só adicionaria um clique. */
  const [comecou] = useState(() => Date.now())

  if (questoes.length === 0) {
    return (
      <div className="prova">
        <p className="form-dica">
          Este simulado ainda não tem questões estruturadas. Peça para a IA do
          Cortex montá-las, ou escreva <code>questoes:</code> no topo da nota.
        </p>
        <button className="btn" onClick={aoSair}>Voltar</button>
      </div>
    )
  }

  const q = questoes[atual]
  const respondidas = Object.keys(respostas).length

  const finalizar = (): void => {
    const e = estatisticas(questoes, respostas)
    const minutos = Math.round((Date.now() - comecou) / 60000)
    setCorrigido(true)
    aoGravar({
      acertos: e.certas,
      total: e.total,
      minutos,
      // Gravadas para dar para rever o simulado depois.
      respostas: questoes.map((_, i) => respostas[i] ?? '-').join('')
    })
  }

  if (corrigido) {
    const e = estatisticas(questoes, respostas)
    const minutos = Math.round((Date.now() - comecou) / 60000)
    const erradas = questoes
      .map((qq, i) => ({ qq, i }))
      .filter(({ qq, i }) => respostas[i] !== qq.gabarito)

    return (
      <div className="prova">
        <div className="prova-resultado">
          <strong className="prova-nota">{e.certas} / {e.total}</strong>
          <span className="linha-valor">
            {Math.round((e.certas / e.total) * 100)}% · {minutos} min
            {e.emBranco > 0 && ` · ${e.emBranco} em branco`}
          </span>
        </div>

        <h3 className="secao">Por matéria</h3>
        <div className="lista-notas">
          {e.porMateria.map(m => (
            <div key={m.materia} className="linha">
              <span className="linha-titulo">{m.materia}</span>
              <span className="linha-valor">{m.certas}/{m.total}</span>
              <span className="nivel" data-n={Math.max(1, Math.ceil(m.pct / 20))}>{m.pct}%</span>
            </div>
          ))}
        </div>
        <p className="form-dica">
          A matéria do topo é a que precisa de revisão primeiro: a lista está
          ordenada do pior para o melhor.
        </p>

        <h3 className="secao">O que você errou</h3>
        {erradas.length === 0 ? (
          <p className="form-dica">Nenhum erro. Simulado gabaritado.</p>
        ) : (
          <div className="cards">
            {erradas.map(({ qq, i }) => (
              <div key={i} className="card">
                <div className="card-topo">
                  <strong>Questão {qq.n ?? i + 1}</strong>
                  {qq.materia && <span className="chip">{qq.materia}</span>}
                </div>
                <p className="prova-enunciado">{qq.enunciado}</p>
                <p className="form-dica">
                  Você marcou <b>{respostas[i] ? respostas[i].toUpperCase() : '—'}</b>;
                  a resposta é <b>{(qq.gabarito ?? '').toUpperCase()}</b>.
                </p>
                {qq.comentario && <p className="prova-comentario">{qq.comentario}</p>}
              </div>
            ))}
          </div>
        )}

        <button className="btn largo" onClick={aoSair}>Fechar</button>
      </div>
    )
  }

  return (
    <div className="prova">
      <div className="prova-topo">
        <span className="linha-valor">Questão {atual + 1} de {questoes.length}</span>
        {q.materia && <span className="chip">{q.materia}</span>}
        <span className="linha-valor">{respondidas} respondidas</span>
      </div>
      <div className="barra"><i style={{ width: `${((atual + 1) / questoes.length) * 100}%` }} /></div>

      <p className="prova-enunciado">{q.enunciado}</p>

      <div className="prova-alternativas">
        {LETRAS.map(l => {
          const texto = q[l]
          if (!texto) return null
          return (
            <button
              key={l}
              type="button"
              className="prova-alternativa"
              data-marcada={respostas[atual] === l || undefined}
              onClick={() => setRespostas({ ...respostas, [atual]: l })}
            >
              <span className="prova-letra">{l.toUpperCase()}</span>
              <span>{texto}</span>
            </button>
          )
        })}
      </div>

      <div className="prova-navegacao">
        <button className="btn-fantasma" disabled={atual === 0}
          onClick={() => setAtual(atual - 1)}>Anterior</button>
        {atual < questoes.length - 1 ? (
          <button className="btn" onClick={() => setAtual(atual + 1)}>Próxima</button>
        ) : (
          <button className="btn" onClick={finalizar}>Finalizar e corrigir</button>
        )}
      </div>

      {/* Sair sem finalizar não grava nada: simulado pela metade não é nota. */}
      <button className="btn-fantasma largo" onClick={aoSair}>Sair sem corrigir</button>
    </div>
  )
}
