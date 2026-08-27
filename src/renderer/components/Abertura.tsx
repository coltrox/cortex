import { useState } from 'react'

/**
 * Primeiro acesso.
 *
 * Dois passos: onde o vault vive, e o que você quer usar. O segundo passo
 * existe porque o app tem sete áreas e ninguém precisa de todas — quem só
 * quer estudar não deveria abrir o app e ver uma aba de treino vazia.
 *
 * Nenhum caminho é digitado aqui: criar e escolher passam pelo diálogo nativo
 * do processo principal. O renderer nunca nomeia uma pasta do disco.
 */

export const AREAS = [
  { id: 'conhecimento', nome: 'Estudos', linha: 'Conteúdos, provas, simulados, redações e livros' },
  { id: 'saude', nome: 'Saúde', linha: 'Treinos, cardio, medidas, dieta e suplementos' },
  { id: 'financas', nome: 'Grana', linha: 'Transações por categoria e porquinho' },
  { id: 'vida', nome: 'Vida', linha: 'Anotações, metas, compras, documentos e senhas' },
  { id: 'dev', nome: 'Dev', linha: 'Pastas de código, editor, terminal e notas de projeto' },
  { id: 'calendario', nome: 'Agenda', linha: 'Calendário mensal com tudo que tem data' }
]

type Props = {
  root: string | null
  escolheu: boolean
  areasAtuais: string[]
  erro: string | null
  aoCriar: () => void
  aoEscolher: () => void
  aoConfirmarAreas: (areas: string[]) => void
}

export function Abertura({
  root, escolheu, areasAtuais, erro, aoCriar, aoEscolher, aoConfirmarAreas
}: Props) {
  const [marcadas, setMarcadas] = useState<string[]>(() =>
    areasAtuais.length ? areasAtuais : AREAS.map(a => a.id))

  const alternar = (id: string): void =>
    setMarcadas(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]))

  if (!root) {
    return (
      <div className="abertura">
        <div className="abertura-caixa">
          <h1>Cortex</h1>
          <p className="abertura-sub">
            Tudo que você anota vira um arquivo markdown numa pasta sua. O app é a
            interface; os arquivos são a verdade — e continuam legíveis sem ele.
          </p>
          {erro && <div className="erro">{erro}</div>}
          <div className="abertura-acoes">
            <button className="btn grande" onClick={aoCriar}>Criar um vault</button>
            <button className="btn-fantasma grande" onClick={aoEscolher}>Já tenho uma pasta</button>
          </div>
          <p className="abertura-rodape">
            Criar abre uma janela para escolher onde — o padrão é uma pasta
            {' '}<code>Cortex</code> na sua área de trabalho.
          </p>
        </div>
      </div>
    )
  }

  if (escolheu) return null

  return (
    <div className="abertura">
      <div className="abertura-caixa larga">
        <h1>O que você vai usar?</h1>
        <p className="abertura-sub">
          Só aparece o que você marcar. Dá para mudar depois — nada é apagado ao
          desmarcar uma área, ela só some da barra lateral.
        </p>

        <div className="areas">
          {AREAS.map(a => (
            <button
              key={a.id}
              className="area"
              aria-pressed={marcadas.includes(a.id)}
              onClick={() => alternar(a.id)}
            >
              <span className="area-check">{marcadas.includes(a.id) ? '✓' : ''}</span>
              <span className="area-texto">
                <strong>{a.nome}</strong>
                <span>{a.linha}</span>
              </span>
            </button>
          ))}
        </div>

        {erro && <div className="erro">{erro}</div>}

        <div className="abertura-acoes">
          <button className="btn grande" onClick={() => aoConfirmarAreas(marcadas)}>
            Começar
          </button>
          <span className="abertura-nota">
            O Hoje aparece sempre — ele é o resumo do que você marcar.
          </span>
        </div>
        <p className="abertura-rodape">Vault em <code>{root}</code></p>
      </div>
    </div>
  )
}
