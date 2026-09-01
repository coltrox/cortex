import { useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { lerVaultId, gravarVaultId } from '../ajustes'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

export function Ajustes(p: { cardapio: UsoDoCardapio; irPara: (t: Tela) => void }) {
  const atual = lerVaultId(guardadoDoNavegador)
  const [id, setId] = useState(atual ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const salvar = async () => {
    try {
      gravarVaultId(guardadoDoNavegador, id)
      setErro(null)
      setSalvo(true)
      // Buscar o cardápio na hora é a única confirmação honesta de que o id
      // está certo: se voltar vazio, o aviso aparece agora e não amanhã.
      await p.cardapio.atualizar()
    } catch (e) {
      setSalvo(false)
      setErro(e instanceof Error ? e.message : 'id inválido')
    }
  }

  const quando = p.cardapio.cardapio.atualizadoEm
  return (
    <>
      <Cabecalho titulo="Ajustes" aoVoltar={atual ? () => p.irPara('hoje') : undefined} />

      {!atual && (
        <Aviso>
          Cole o id do vault. Ele aparece no Cortex, em Configurações, na aba Nuvem.
        </Aviso>
      )}
      {erro && <Aviso grave aoFechar={() => setErro(null)}>{erro}</Aviso>}
      {salvo && !erro && !p.cardapio.erro && <Aviso>Id salvo.</Aviso>}
      {p.cardapio.erro && <Aviso grave>{p.cardapio.erro}</Aviso>}

      <div className="secao">
        <Campo
          rotulo="Id do vault"
          valor={id}
          aoMudar={v => { setId(v); setSalvo(false) }}
          dica="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"
        />
        <div className="grade">
          <Botao tipo="principal" aoClicar={() => void salvar()}>Salvar</Botao>
          <Botao aoClicar={() => p.irPara('lerqr')}>Ler QR</Botao>
        </div>

        <h2>Cardápio</h2>
        <p className="nota">
          {p.cardapio.cardapio.itens.length} itens
          {quando && ` · atualizado em ${new Date(quando).toLocaleString('pt-BR')}`}
        </p>
        <Botao aoClicar={() => void p.cardapio.atualizar()} desligado={p.cardapio.buscando}>
          {p.cardapio.buscando ? 'buscando…' : 'Buscar cardápio agora'}
        </Botao>
      </div>
    </>
  )
}
