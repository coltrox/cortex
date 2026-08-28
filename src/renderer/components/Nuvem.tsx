import { useEffect, useState } from 'react'

/**
 * Configuração da captura rápida.
 *
 * O id do vault aparece copiável porque é ele que se cola no celular. O botão
 * de gerar um novo existe para o dia em que ele vazar num print — e o aviso
 * diz o que acontece, para ninguém clicar sem saber.
 */
type Estado = { vaultId: string; configurada: boolean; url: string | null }

export function Nuvem({ aoFechar }: { aoFechar: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [url, setUrl] = useState('')
  const [chave, setChave] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = async (): Promise<void> => {
    const e = await window.vaultApi.invoke('nuvem:estado', {}) as Estado
    setEstado(e)
    setUrl(e.url ?? '')
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

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form largo" onClick={e => e.stopPropagation()}>
        <div className="form-topo">Nuvem — captura rápida</div>

        <div className="form-corpo">
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

          <div className="form-linha">
            <label className="form-campo">
              <span className="form-rotulo">URL do projeto Supabase</span>
              <input value={url} placeholder="https://xxx.supabase.co"
                onChange={e => setUrl(e.target.value)} />
            </label>
            <label className="form-campo">
              <span className="form-rotulo">Chave anon</span>
              <input value={chave} placeholder={estado.configurada ? '(guardada)' : ''}
                onChange={e => setChave(e.target.value)} />
            </label>
          </div>

          {aviso && <div className="aviso">{aviso}</div>}
        </div>

        <div className="form-rodape">
          <button className="btn-fantasma" disabled={ocupado} onClick={() => void fazer(async () => {
            const r = await window.vaultApi.invoke('nuvem:novo-id', {}) as { vaultId: string }
            return `ID novo gerado. Os celulares com o ID antigo pararam de entregar: cole ${r.vaultId.slice(0, 8)}… neles.`
          })}>Gerar ID novo</button>

          <button className="btn-fantasma" disabled={ocupado} onClick={() => void fazer(async () => {
            const r = await window.vaultApi.invoke('nuvem:publicar', {}) as { itens: number }
            return `${r.itens} itens do cardápio publicados.`
          })}>Publicar cardápio</button>

          <button className="btn-fantasma" disabled={ocupado} onClick={() => void fazer(async () => {
            const r = await window.vaultApi.invoke('nuvem:sincronizar', {}) as
              { aplicados: number; ignorados: number; falhas: number; pulado: boolean }
            // `pulado: true` quer dizer que esta rodada nem chegou a rodar —
            // já havia outra em andamento (o timer de 2 minutos, por exemplo)
            // para o mesmo vault, e esta desistiu. Sem distinguir os dois
            // casos, "0 registros novos" pareceria "está tudo em dia" quando
            // na verdade o clique não fez nada e a rodada real ainda está em
            // curso.
            if (r.pulado) {
              return 'Já havia uma sincronização em andamento — aguarde e tente de novo.'
            }
            const falha = r.falhas > 0 ? `, ${r.falhas} falharam` : ''
            return `${r.aplicados} registros novos, ${r.ignorados} já aplicados antes${falha}.`
          })}>Sincronizar agora</button>

          <button className="btn" disabled={ocupado || !url || (!chave && !estado.configurada)}
            onClick={() => void fazer(async () => {
              await window.vaultApi.invoke('nuvem:credenciais', { url, chave })
              setChave('')
              return 'Credenciais salvas.'
            })}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
