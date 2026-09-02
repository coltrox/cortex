import { useState } from 'react'
import { diaLocal, eventoPorquinho } from '../montar'
import { porquinho, reais } from '../cardapio'
import { Cabecalho, Botao, Campo, CampoNumero, Aviso, Secao } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/**
 * O porquinho.
 *
 * Mostra quanto tem e quanto falta, e registra um movimento: guardar ou tirar.
 * O saldo vem somado do Cortex — o celular nunca manda um saldo, só o
 * movimento. Se mandasse o saldo, dois aparelhos offline no mesmo dia
 * sobrescreveriam um ao outro e o dinheiro sumiria.
 *
 * O número aparece grande porque a pergunta que faz alguém abrir esta tela é
 * "quanto falta?", e ela precisa ser respondida antes de qualquer rolagem.
 */
export function Porquinho(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const cofre = porquinho(p.cardapio.cardapio)
  const [valor, setValor] = useState('')
  const [titulo, setTitulo] = useState('')
  const [direcao, setDirecao] = useState<'deposito' | 'sangria'>('deposito')
  const [erro, setErro] = useState<string | null>(null)

  const guardando = direcao === 'deposito'

  const enviar = (): void => {
    try {
      p.envio.registrar(eventoPorquinho(
        // Descrição vazia vira o rótulo do próprio movimento: no vault a nota
        // precisa de um nome, e "Guardei"/"Tirei" diz mais que um branco.
        titulo.trim() || (guardando ? 'Guardei' : 'Tirei'),
        Number(valor),
        direcao,
        diaLocal()
      ))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  const falta = cofre?.alvo != null ? Math.max(0, cofre.alvo - cofre.saldo) : null
  const porcento = cofre?.alvo ? Math.min(100, (cofre.saldo / cofre.alvo) * 100) : 0

  return (
    <div className="tema-dinheiro">
      <Cabecalho titulo="Porquinho" aoVoltar={() => p.irPara('hoje')} />

      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="bloco">
        {cofre ? (
          <div className="painel-meta">
            <div className="meta-para">{cofre.alvo != null ? cofre.nome : 'Guardado'}</div>
            <div className="meta-valor">{reais(cofre.saldo)}</div>
            {cofre.alvo != null && (
              <>
                <div className="meta-alvo">
                  de {reais(cofre.alvo)}
                  {falta != null && falta > 0 && <> · faltam {reais(falta)}</>}
                  {falta === 0 && <> · meta batida</>}
                </div>
                <div className="meta-barra"><i style={{ width: `${porcento}%` }} /></div>
              </>
            )}
          </div>
        ) : (
          <p className="secao-vazia">
            Nenhum movimento ainda. O que você registrar aqui vira o saldo, e a
            meta vem do Cortex.
          </p>
        )}

        <Secao nome={guardando ? 'Guardar' : 'Tirar'} />

        <div className="alternador">
          <button type="button" className={guardando ? 'ligado' : ''}
            onClick={() => setDirecao('deposito')}>Guardar</button>
          <button type="button" className={guardando ? '' : 'ligado'}
            onClick={() => setDirecao('sangria')}>Tirar</button>
        </div>

        <CampoNumero rotulo="Quanto (R$)" valor={valor} aoMudar={setValor} dica="0,00" grande />
        <Campo
          rotulo="Por quê"
          valor={titulo}
          aoMudar={setTitulo}
          dica={guardando ? 'Guardei do salário' : 'Peça da bicicleta'}
        />

        <Botao tipo="principal" aoClicar={enviar} desligado={valor.trim() === ''}>
          {guardando ? 'Guardar' : 'Tirar do porquinho'}
        </Botao>
      </div>
    </div>
  )
}
