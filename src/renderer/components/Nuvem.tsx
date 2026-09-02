import { useEffect, useState } from 'react'
import { Confirmar } from './Confirmar'
import { Qr, conteudoDoQr } from './Qr'

/**
 * Configuração da captura rápida.
 *
 * O id do vault aparece copiável porque é ele que se cola no celular. O botão
 * de gerar um novo existe para o dia em que ele vazar num print — e o aviso
 * diz o que acontece, para ninguém clicar sem saber.
 */
type Estado = {
  vaultId: string
  configurada: boolean
  url: string | null
  enderecoApp: string
}

export function Nuvem({ aoFechar, sincronizacaoAutomaticaFalhando }: {
  aoFechar: () => void
  /**
   * A sincronização automática (timer de 2 minutos, em `App.tsx`) está
   * rejeitando de forma repetida — credencial errada, chave revogada, o que
   * for. O aviso aparece assim que este painel abre: não há mais botão nenhum
   * para apertar, então este é o único lugar onde uma falha teimosa pode ser
   * dita a quem usa.
   */
  sincronizacaoAutomaticaFalhando?: boolean
}) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [endereco, setEndereco] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // Trocar o id é irreversível — revoga TODOS os celulares já colados com o
  // id atual — e antes disso acontecia no primeiro clique, com o aviso só
  // aparecendo depois do fato consumado. `Confirmar` (mesmo componente usado
  // para excluir nota) faz explicar antes de agir, não depois.
  const [confirmandoNovoId, setConfirmandoNovoId] = useState(false)

  const carregar = async (): Promise<void> => {
    const e = await window.vaultApi.invoke('nuvem:estado', {}) as Estado
    setEstado(e)
    setEndereco(e.enderecoApp)
  }
  useEffect(() => { void carregar() }, [])

  const fazer = async (o: () => Promise<string>): Promise<void> => {
    setOcupado(true)
    try {
      setAviso(await o())
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
      void carregar()
    }
  }

  if (!estado) return null

  const gerarIdNovo = (): void => {
    setConfirmandoNovoId(false)
    void fazer(async () => {
      const r = await window.vaultApi.invoke('nuvem:novo-id', {}) as { vaultId: string }
      return `ID novo gerado. Os celulares com o ID antigo pararam de entregar: cole ${r.vaultId.slice(0, 8)}… neles.`
    })
  }

  return (
    <>
      <div className="paleta-fundo" onClick={aoFechar}>
        <div className="form largo" onClick={e => e.stopPropagation()}>
          <div className="form-topo">Celular</div>

          <div className="form-corpo">
            {sincronizacaoAutomaticaFalhando && (
              <div className="aviso">
                A sincronização com o celular está falhando há alguns minutos. Costuma ser
                internet fora do ar; se persistir, pode ser o banco. Ela tenta sozinha de
                novo a cada dois minutos — não há nada a apertar aqui.
              </div>
            )}

            <label className="form-campo">
              <span className="form-rotulo">ID deste vault</span>
              <span className="form-senha">
                <input readOnly value={estado.vaultId} onFocus={e => e.currentTarget.select()} />
                <button className="btn-fantasma"
                  onClick={() => void navigator.clipboard.writeText(estado.vaultId)}>
                  copiar
                </button>
              </span>
              <span className="form-dica">
                Cole no app do celular. Qualquer aparelho com este ID envia para cá —
                e quem vir o ID também consegue. Se vazar, gere um novo.
              </span>
            </label>

            <div className="qr-bloco">
              <Qr conteudo={conteudoDoQr(estado.vaultId, estado.enderecoApp)} />
              <div className="qr-texto">
                <strong>Aponte a câmera do celular</strong>
                {estado.enderecoApp ? (
                  <p className="form-dica">
                    A câmera abre o app já conectado a este vault. O ID viaja
                    depois do <code>#</code>, que o navegador não manda para o
                    servidor — ele não aparece em log de acesso nenhum.
                  </p>
                ) : (
                  <p className="form-dica">
                    Sem o endereço do app abaixo, o QR carrega só o ID: dá para
                    ler e colar à mão, mas não abre nada sozinho.
                  </p>
                )}
                <label className="form-campo">
                  <span className="form-rotulo">Endereço do app do celular</span>
                  <span className="form-senha">
                    <input value={endereco} placeholder="https://cortex-wapp.vercel.app"
                      onChange={e => setEndereco(e.target.value)} />
                    <button className="btn-fantasma" disabled={ocupado}
                      onClick={() => void fazer(async () => {
                        const r = await window.vaultApi.invoke('nuvem:endereco', {
                          endereco
                        }) as { enderecoApp: string }
                        return r.enderecoApp
                          ? 'Endereço salvo. O QR agora abre o app sozinho.'
                          : 'Endereço vazio ou fora do formato https:// — o QR volta a carregar só o ID.'
                      })}>
                      salvar
                    </button>
                  </span>
                </label>
              </div>
            </div>

            {aviso && <div className="aviso">{aviso}</div>}
          </div>

          <div className="form-rodape">
            <button className="btn-fantasma" disabled={ocupado} onClick={() => setConfirmandoNovoId(true)}>
              Gerar ID novo
            </button>
          </div>
        </div>
      </div>

      {confirmandoNovoId && (
        <Confirmar
          titulo="Gerar um ID novo?"
          texto="Os celulares que já têm o ID atual colado param de entregar na hora — cada um precisa ser recolado com o ID novo. Não tem como desfazer."
          rotulo="Gerar ID novo"
          perigo
          aoConfirmar={gerarIdNovo}
          aoFechar={() => setConfirmandoNovoId(false)}
        />
      )}
    </>
  )
}
