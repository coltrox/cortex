import { useState } from 'react'
import { diaLocal, eventoCardio } from '../montar'
import { Cabecalho, Botao, Campo, CampoNumero, Aviso, Secao, Chips } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

const APARELHOS = ['esteira', 'bicicleta', 'elíptico', 'escada', 'rua', 'outro']

export function Cardio(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [aparelho, setAparelho] = useState(APARELHOS[0])
  const [minutos, setMinutos] = useState('')
  const [distancia, setDistancia] = useState('')
  const [pace, setPace] = useState('')
  const [nivel, setNivel] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = () => {
    try {
      p.envio.registrar(eventoCardio(aparelho, Number(minutos), {
        distancia: distancia ? Number(distancia) : undefined,
        pace: pace || undefined,
        nivel: nivel ? Number(nivel) : undefined
      }, diaLocal()))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-treino">
      <Cabecalho titulo="Cardio" aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <Secao nome="Aparelho" />
        <Chips opcoes={APARELHOS} escolhida={aparelho} aoEscolher={setAparelho} />
        <CampoNumero rotulo="Minutos" valor={minutos} aoMudar={setMinutos} dica="30" />
        <CampoNumero rotulo="Distância (km)" valor={distancia} aoMudar={setDistancia} dica="5" />
        <Campo rotulo="Pace" valor={pace} aoMudar={setPace} dica="6:00" />
        <CampoNumero rotulo="Nível" valor={nivel} aoMudar={setNivel} dica="8" />
        <Botao tipo="principal" aoClicar={enviar}>Registrar cardio</Botao>
      </div>
    </div>
  )
}
