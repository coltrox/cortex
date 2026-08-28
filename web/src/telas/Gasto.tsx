import { useState } from 'react'
import { diaLocal, eventoGasto } from '../montar'
import { Cabecalho, Botao, Campo, CampoNumero, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

const CATEGORIAS = ['comida', 'transporte', 'lazer', 'estudo', 'saude', 'outros']

export function Gasto(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [item, setItem] = useState('')
  const [valor, setValor] = useState('')
  const [cat, setCat] = useState('')
  const [dir, setDir] = useState<'saida' | 'entrada'>('saida')
  const [erro, setErro] = useState<string | null>(null)
  const saiu = dir === 'saida'

  const enviar = () => {
    try {
      p.envio.registrar(eventoGasto(item, Number(valor), { cat: cat || undefined, dir }, diaLocal()))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <>
      <Cabecalho titulo={saiu ? 'Gasto' : 'Entrada'} aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso grave aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="secao">
        <div className="grade">
          <Botao tipo={saiu ? 'principal' : 'comum'} aoClicar={() => setDir('saida')}>Saiu</Botao>
          <Botao tipo={saiu ? 'comum' : 'principal'} aoClicar={() => setDir('entrada')}>Entrou</Botao>
        </div>
        <Campo rotulo="O quê" valor={item} aoMudar={setItem} dica="almoço" />
        <CampoNumero rotulo="Valor (R$)" valor={valor} aoMudar={setValor} dica="32,50" />
        <h2>Categoria</h2>
        <div className="grade">
          {CATEGORIAS.map(c => (
            <Botao
              key={c}
              tipo={c === cat ? 'principal' : 'comum'}
              aoClicar={() => setCat(c === cat ? '' : c)}
            >
              {c}
            </Botao>
          ))}
        </div>
        <Botao tipo="principal" aoClicar={enviar}>
          {saiu ? 'Registrar gasto' : 'Registrar entrada'}
        </Botao>
      </div>
    </>
  )
}
