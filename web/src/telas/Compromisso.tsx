import { useState } from 'react'
import { diaLocal, eventoCompromisso } from '../montar'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

export function Compromisso(p: {
  envio: ReturnType<typeof useEnvio>
  irPara: (t: Tela) => void
}) {
  const [titulo, setTitulo] = useState('')
  // Já nasce com hoje: a maioria do que se marca no celular é para hoje ou
  // amanhã, e um campo de data vazio no celular é um teclado a mais.
  const [data, setData] = useState(diaLocal())
  const [hora, setHora] = useState('')
  const [local, setLocal] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = (): void => {
    try {
      p.envio.registrar(eventoCompromisso(titulo, data, {
        hora: hora || undefined, local: local || undefined
      }, diaLocal()))
      p.irPara('agenda')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-agenda">
      <Cabecalho titulo="Novo compromisso" aoVoltar={() => p.irPara('agenda')} />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <Campo rotulo="O quê" valor={titulo} aoMudar={setTitulo} dica="Dentista" />
        <div className="par-campos">
          <Campo rotulo="Quando" tipo="date" valor={data} aoMudar={setData} />
          <Campo rotulo="Hora" tipo="time" valor={hora} aoMudar={setHora} />
        </div>
        <Campo rotulo="Onde" valor={local} aoMudar={setLocal} dica="Centro" />
        <Botao tipo="principal" aoClicar={enviar}>Marcar</Botao>
      </div>
    </div>
  )
}
