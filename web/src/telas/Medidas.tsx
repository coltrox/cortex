import { useState } from 'react'
import { diaLocal, eventoMedida, eventoPeso } from '../montar'
import { Cabecalho, Botao, CampoNumero, Aviso, Secao } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

/** Os nomes de campo são os que a lente de Saúde já lê. */
const MEDIDAS = [
  { k: 'cintura', rotulo: 'Cintura (cm)' },
  { k: 'peito', rotulo: 'Peito (cm)' },
  { k: 'quadril', rotulo: 'Quadril (cm)' },
  { k: 'braco', rotulo: 'Braço (cm)' },
  { k: 'coxa', rotulo: 'Coxa (cm)' }
]

export function Medidas(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [peso, setPeso] = useState('')
  const [medidas, setMedidas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const enviar = () => {
    try {
      const dia = diaLocal()
      const numeros: Record<string, number> = {}
      for (const m of MEDIDAS) if (medidas[m.k]) numeros[m.k] = Number(medidas[m.k])

      if (!peso && Object.keys(numeros).length === 0) {
        throw new Error('preencha o peso ou ao menos uma medida')
      }
      // Dois eventos separados quando os dois foram preenchidos: o tipo peso é
      // o atalho de uma tecla e a medida é a fita métrica. Mandar tudo como
      // medida faria o botão de peso deixar de existir. Os dois acabam na
      // mesma nota do vault.
      if (peso) p.envio.registrar(eventoPeso(Number(peso), dia))
      if (Object.keys(numeros).length > 0) p.envio.registrar(eventoMedida(numeros, dia))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-treino">
      <Cabecalho titulo="Peso e medidas" aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <CampoNumero rotulo="Peso (kg)" valor={peso} aoMudar={setPeso} dica="78,4" grande />
        <Secao nome="Fita métrica" />
        {MEDIDAS.map(m => (
          <CampoNumero
            key={m.k}
            rotulo={m.rotulo}
            valor={medidas[m.k] ?? ''}
            aoMudar={v => setMedidas(x => ({ ...x, [m.k]: v }))}
          />
        ))}
        <Botao tipo="principal" aoClicar={enviar}>Registrar</Botao>
      </div>
    </div>
  )
}
