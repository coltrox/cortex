import { useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { lerVaultId, gravarVaultId } from '../ajustes'
import { Cabecalho, Botao, Campo, Aviso, Secao } from '../componentes'
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

  const quantos = p.cardapio.cardapio.itens.length
  const quando = p.cardapio.cardapio.atualizadoEm
  return (
    <div className="tema-hoje">
      <Cabecalho titulo="Ajustes" aoVoltar={atual ? () => p.irPara('hoje') : undefined} />

      {!atual && (
        <Aviso>
          Cole o id do vault, ou leia o QR. Ele está no Cortex, em Configurações → Celular.
        </Aviso>
      )}
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      {/*
        * A resposta que a pessoa espera depois de colar o ID ou ler o QR:
        * conectou, ou não conectou. "Id salvo" nao respondia isso -- salvar um
        * texto num campo nao prova que existe um Cortex do outro lado.
        *
        * O que prova e ter vindo dado. Com id errado e com id certo sem nada
        * publicado o banco responde igual (lista vazia), entao o caso vazio
        * nomeia as duas possibilidades em vez de acusar a errada.
        */}
      {p.cardapio.erro && <Aviso tom="erro">{p.cardapio.erro}</Aviso>}
      {!p.cardapio.erro && atual && quantos > 0 && (
        <Aviso>
          Conectado ao seu Cortex. {quantos} {quantos === 1 ? 'item' : 'itens'} chegaram —
          treinos, dieta e agenda já estão nas outras telas.
        </Aviso>
      )}
      {!p.cardapio.erro && salvo && quantos === 0 && !p.cardapio.buscando && (
        <Aviso>ID salvo. Buscando seus dados…</Aviso>
      )}

      <div className="bloco">
        <Campo
          rotulo="Id do vault"
          valor={id}
          aoMudar={v => { setId(v); setSalvo(false) }}
          dica="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"
        />
        <div className="grade-registrar">
          <Botao tipo="principal" aoClicar={() => void salvar()}>Salvar</Botao>
          <Botao aoClicar={() => p.irPara('lerqr')}>Ler QR</Botao>
        </div>

        <Secao nome="Cardápio" />
        <p className="secao-vazia">
          {p.cardapio.cardapio.itens.length} itens
          {quando && ` · atualizado em ${new Date(quando).toLocaleString('pt-BR')}`}
        </p>
        <Botao aoClicar={() => void p.cardapio.atualizar()} desligado={p.cardapio.buscando}>
          {p.cardapio.buscando ? 'buscando…' : 'Buscar meus dados agora'}
        </Botao>
      </div>
    </div>
  )
}
