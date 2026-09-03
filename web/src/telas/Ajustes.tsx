import { useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { lerVaultId, gravarVaultId } from '../ajustes'
import { haQuantoTempo } from '../cardapio'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/**
 * Ajustes.
 *
 * Dois estados, e o segundo é quase vazio de propósito. Conectado, não há o
 * que ajustar: o vault está ligado, os dados chegam sozinhos, e uma tela
 * cheia de números e botões só daria a impressão de que algo precisa de
 * atenção. Fica o essencial — a quem este celular está ligado — e a saída
 * para trocar.
 *
 * Não há botão de atualizar em lugar nenhum. Manter os dados em dia é
 * trabalho do app: ele busca ao abrir, ao voltar para a tela, quando a rede
 * volta, e a cada dois minutos.
 */
export function Ajustes(p: { cardapio: UsoDoCardapio; irPara: (t: Tela) => void }) {
  const atual = lerVaultId(guardadoDoNavegador)
  const [trocando, setTrocando] = useState(false)
  const [id, setId] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (): Promise<void> => {
    try {
      gravarVaultId(guardadoDoNavegador, id)
      setErro(null)
      setTrocando(false)
      setId('')
      // Buscar na hora é a única confirmação honesta de que o id está certo:
      // se voltar vazio, o aviso aparece agora e não amanhã. `comoConexao` é
      // o que faz vazio virar aviso — fora deste instante, vazio é normal.
      await p.cardapio.atualizar({ comoConexao: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'id inválido')
    }
  }

  const quantos = p.cardapio.cardapio.itens.length
  const conectado = atual !== null && !trocando

  /* ---------- conectado: quase nada ---------- */

  if (conectado) {
    const falhou = p.cardapio.erro !== null
    const quando = haQuantoTempo(p.cardapio.cardapio.atualizadoEm)
    return (
      <div className="tema-hoje">
        <Cabecalho titulo="Ajustes" aoVoltar={() => p.irPara('hoje')} />

        <div className="bloco tela-calma">
          <div className="tela-calma-meio">
            <div className={`selo ${falhou ? 'selo-erro' : ''}`} aria-hidden="true">
              {falhou ? '!' : '✓'}
            </div>
            <h2>{falhou ? 'Sem dados agora' : 'Conectado ao seu Cortex'}</h2>
            <p>
              {falhou
                ? p.cardapio.erro
                : quantos > 0
                  ? 'Treinos, dieta e agenda chegam sozinhos. Não há nada para apertar aqui.'
                  : 'Assim que houver algo no Cortex, ele aparece aqui sozinho.'}
            </p>
            {/* O horário responde "ainda está funcionando?", que é a pergunta
                que traz alguém a esta tela. Não é botão, e não vira um. */}
            {quando && <span className="quando">Atualizado {quando}</span>}
          </div>

          <div className="tela-calma-pe">
            <Botao aoClicar={() => { setTrocando(true); setId('') }}>
              Trocar de vault
            </Botao>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- sem vault, ou trocando ---------- */

  return (
    <div className="tema-hoje">
      <Cabecalho
        titulo={atual ? 'Trocar de vault' : 'Conectar'}
        aoVoltar={atual ? () => { setTrocando(false); setErro(null) } : undefined}
      />

      <Aviso titulo={atual ? 'Trocar desliga o vault atual' : 'Ligue este celular ao seu Cortex'}>
        Leia o QR que está no Cortex, em Configurações → Celular. Ou cole o id
        do vault à mão.
      </Aviso>

      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="bloco">
        <Botao tipo="principal" aoClicar={() => p.irPara('lerqr')}>
          Ler QR com a câmera
        </Botao>

        <Campo
          rotulo="Ou cole o id do vault"
          valor={id}
          aoMudar={v => { setId(v); setErro(null) }}
          dica="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"
        />
        <Botao aoClicar={() => void salvar()} desligado={id.trim() === ''}>
          Conectar com este id
        </Botao>
      </div>
    </div>
  )
}
