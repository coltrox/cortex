import { useState } from 'react'
import { diaLocal, eventoGasto } from '../montar'
import { Cabecalho, Botao, Campo, CampoNumero, Aviso, Secao, Chips } from '../componentes'
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
    <div className="tema-dinheiro">
      <Cabecalho titulo={saiu ? 'Gasto' : 'Entrada'} aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <div className="alternador">
          <button type="button" className={saiu ? 'ligado' : ''} onClick={() => setDir('saida')}>Saiu</button>
          <button type="button" className={saiu ? '' : 'ligado'} onClick={() => setDir('entrada')}>Entrou</button>
        </div>
        <Campo rotulo="O quê" valor={item} aoMudar={setItem} dica="almoço" />
        <CampoNumero rotulo="Valor (R$)" valor={valor} aoMudar={setValor} dica="32,50" />
        <Secao nome="Categoria" />
        <Chips opcoes={CATEGORIAS} escolhida={cat}
          aoEscolher={c => setCat(c === cat ? '' : c)} />
        <Botao tipo="principal" aoClicar={enviar}>
          {saiu ? 'Registrar gasto' : 'Registrar entrada'}
        </Botao>
      </div>
    </div>
  )
}
