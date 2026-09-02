import { useState } from 'react'
import { diaLocal, eventoAnotacao } from '../montar'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

export function Anotacao(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [texto, setTexto] = useState('')
  const [prioridade, setPrioridade] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = () => {
    try {
      p.envio.registrar(eventoAnotacao(texto, diaLocal(), prioridade))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-hoje">
      <Cabecalho titulo="Anotação" aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <Campo rotulo="" valor={texto} aoMudar={setTexto} linhas={8} dica="o que aconteceu" />

        {/* Um interruptor, e não uma escala: "média prioridade" não ajuda a
            decidir o que fazer primeiro. A nota marcada sobe para o topo da
            lista no Cortex, com estrela. */}
        <div className="chips">
          <button
            className={`chip ${prioridade ? 'chip-ligado' : ''}`}
            type="button"
            aria-pressed={prioridade}
            onClick={() => setPrioridade(v => !v)}
          >
            ★ Prioridade
          </button>
        </div>

        <Botao tipo="principal" aoClicar={enviar}>Salvar anotação</Botao>
      </div>
    </div>
  )
}
