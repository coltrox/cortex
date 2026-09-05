import { useState } from 'react'
import { diaLocal, eventoAnotacao } from '../montar'
import { guardarAnotacao } from '../anotacoes'
import { guardadoDoNavegador } from '../guardado'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

export function Anotacao(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [texto, setTexto] = useState('')
  const [prioridade, setPrioridade] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = () => {
    const dia = diaLocal()
    try {
      p.envio.registrar(eventoAnotacao(texto, dia, prioridade))
      // A cópia local, para a anotação já estar na lista do Hoje quando esta
      // tela fechar. O caminho de volta pelo Cortex existe e é o definitivo,
      // mas depende do computador estar ligado — sem esta linha, escrever uma
      // anotação com o Cortex desligado devolveria a tela de antes, sem sinal
      // nenhum de que ela saiu. `conciliarAnotacoes` tira a cópia quando a de
      // verdade chega.
      guardarAnotacao(guardadoDoNavegador, dia, texto, prioridade)
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
