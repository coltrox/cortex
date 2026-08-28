import { useState } from 'react'
import { diaLocal, eventoAnotacao } from '../montar'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

export function Anotacao(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = () => {
    try {
      p.envio.registrar(eventoAnotacao(texto, diaLocal()))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <>
      <Cabecalho titulo="Anotação" aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso grave aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="secao">
        <Campo rotulo="" valor={texto} aoMudar={setTexto} linhas={8} dica="o que aconteceu" />
        <Botao tipo="principal" aoClicar={enviar}>Salvar anotação</Botao>
      </div>
    </>
  )
}
