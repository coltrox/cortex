import { useState } from 'react'
import { Campo, Selecao } from '../componentes'

/**
 * Corrigir um suplemento ou uma tarefa diária sem abrir o computador.
 *
 * Os dois são a mesma coisa na tela — um nome que se marca todo dia —, e por
 * isso são o mesmo painel. O que muda é um campo: o suplemento tem dose, a
 * tarefa tem descrição.
 *
 * Trocar a dose é o exemplo que justifica isto existir: a decisão acontece na
 * hora de tomar, com o pote na mão, e não na frente do computador de noite.
 */

/** Os dias no vocabulário do Cortex — sem acento em `sab`, como o vault grava. */
const DIAS: { id: string; curto: string }[] = [
  { id: 'seg', curto: 'S' }, { id: 'ter', curto: 'T' }, { id: 'qua', curto: 'Q' },
  { id: 'qui', curto: 'Q' }, { id: 'sex', curto: 'S' }, { id: 'sab', curto: 'S' },
  { id: 'dom', curto: 'D' }
]

/** Os momentos que os formulários do Cortex já oferecem. */
const MOMENTOS = [
  'qualquer hora', 'ao acordar', 'manhã', 'antes do treino', 'pós-treino',
  'almoço', 'tarde', 'jantar', 'antes de dormir'
]

export type ValoresDoItem = {
  dose?: string
  quando: string
  dias: string[]
  /** Só a tarefa diária: o passo a passo que ela guarda no corpo. */
  descricao?: string
}

export function EditarItemDoDia(p: {
  nome: string
  /** `true` mostra a dose; `false` mostra a descrição. */
  temDose: boolean
  valores: ValoresDoItem
  aoSalvar: (v: ValoresDoItem) => void
  aoCancelar: () => void
}) {
  const [dose, setDose] = useState(p.valores.dose ?? '')
  const [quando, setQuando] = useState(p.valores.quando || 'qualquer hora')
  const [dias, setDias] = useState<string[]>(p.valores.dias)
  const [descricao, setDescricao] = useState(p.valores.descricao ?? '')

  const alternarDia = (id: string): void => {
    setDias(d => (d.includes(id) ? d.filter(x => x !== id) : [...d, id]))
  }

  return (
    <div className="editar-item">
      <span className="editar-item-nome">{p.nome}</span>

      {p.temDose
        ? <Campo rotulo="Quanto" valor={dose} aoMudar={setDose} dica="30 g" />
        : <Campo rotulo="Descrição" valor={descricao} aoMudar={setDescricao} linhas={3}
            dica="o que fazer, o passo a passo" />}

      <Selecao rotulo="Quando" opcoes={MOMENTOS} valor={quando} aoMudar={setQuando} />

      <span className="campo-rotulo">Dias</span>
      {/* Sete botões numa fileira, e não um seletor: o dia da semana é escolha
          múltipla, e ver de uma vez quais estão ligados é metade da
          informação. Nenhum marcado quer dizer TODO dia — é o que o Cortex
          entende por ausência, e a linha abaixo diz isso em palavras. */}
      <div className="editar-dias">
        {DIAS.map(d => (
          <button
            key={d.id}
            type="button"
            className={`dia-chip ${dias.includes(d.id) ? 'dia-ligado' : ''}`}
            aria-pressed={dias.includes(d.id)}
            aria-label={d.id}
            onClick={() => alternarDia(d.id)}
          >
            {d.curto}
          </button>
        ))}
      </div>
      <p className="editar-dica">
        {dias.length === 0 ? 'Nenhum dia marcado: vale todo dia.' : `${dias.length} de 7 dias.`}
      </p>

      <div className="editar-acoes">
        <button
          className="btn btn-principal"
          type="button"
          onClick={() => p.aoSalvar({
            dose: p.temDose ? dose.trim() : undefined,
            quando: quando.trim(),
            dias,
            descricao: p.temDose ? undefined : descricao.trim()
          })}
        >
          Salvar
        </button>
        <button className="btn-fantasma" type="button" onClick={p.aoCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
