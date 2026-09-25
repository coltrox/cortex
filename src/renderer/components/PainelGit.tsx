import { useCallback, useEffect, useState } from 'react'
import type { EstadoGit } from '../../shared/types'

/**
 * O GitHub do projeto, na lente Dev.
 *
 * Três gestos, e só: colar o link do repositório, commitar o que mudou e
 * empurrar. Pedido do dono — "só jogar o link e apertar um botão de commit e
 * outro de push". Quem faz de verdade é `main/dev/git.ts`; aqui não se monta
 * comando nenhum.
 *
 * Quem quiser branch, histórico e merge abre o VS Code, que está ali do lado.
 */
export function PainelGit({ raiz, sub, aoFechar }: {
  raiz: string
  /** A pasta do projeto dentro da raiz autorizada. */
  sub: string
  aoFechar: () => void
}) {
  const [est, setEst] = useState<EstadoGit | null>(null)
  const [url, setUrl] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null)

  const reler = useCallback(async (): Promise<void> => {
    try {
      const e = await window.vaultApi.git.estado(raiz, sub)
      setEst(e)
      setUrl(u => u || e.remoto)
    } catch {
      setEst(null)
    }
  }, [raiz, sub])

  useEffect(() => { void reler() }, [reler])

  /** Roda um dos gestos, mostrando o que o git respondeu. */
  const fazer = async (qual: string, acao: () => Promise<{ ok: boolean; saida: string }>): Promise<void> => {
    setOcupado(qual)
    setRecado(null)
    try {
      const r = await acao()
      setRecado({ ok: r.ok, texto: r.saida || (r.ok ? 'Pronto.' : 'Não deu certo.') })
      await reler()
    } catch (e) {
      setRecado({ ok: false, texto: e instanceof Error ? e.message : 'não deu certo' })
    } finally {
      setOcupado('')
    }
  }

  const ligado = !!est?.remoto

  return (
    <div className="git-painel">
      <div className="git-topo">
        <strong>GitHub</strong>
        {est && (
          <span className="git-resumo">
            {!est.repo
              ? 'esta pasta ainda não é um repositório'
              : `${est.ramo || 'sem ramo'} · ${est.alterados} ${est.alterados === 1 ? 'arquivo mudado' : 'arquivos mudados'}${est.aFrente > 0 ? ` · ${est.aFrente} para enviar` : ''}`}
          </span>
        )}
        <button className="btn-icone" title="Fechar" onClick={aoFechar}>×</button>
      </div>

      <div className="git-linha">
        <input
          value={url}
          placeholder="https://github.com/voce/projeto"
          aria-label="Endereço do repositório no GitHub"
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && url.trim()) {
              void fazer('remoto', () => window.vaultApi.git.remoto(raiz, sub, url))
            }
          }}
        />
        <button
          className="btn-fantasma pequeno"
          disabled={!url.trim() || ocupado !== ''}
          onClick={() => void fazer('remoto', () => window.vaultApi.git.remoto(raiz, sub, url))}
        >
          {ocupado === 'remoto' ? 'ligando…' : ligado ? 'Trocar' : 'Ligar'}
        </button>
      </div>

      <div className="git-linha">
        <input
          value={mensagem}
          placeholder="O que mudou (opcional)"
          aria-label="Mensagem do commit"
          onChange={e => setMensagem(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void fazer('commit', () => window.vaultApi.git.commit(raiz, sub, mensagem))
          }}
        />
        <button
          className="btn-fantasma pequeno"
          disabled={ocupado !== ''}
          title="git add -A e git commit"
          onClick={() => void fazer('commit', async () => {
            const r = await window.vaultApi.git.commit(raiz, sub, mensagem)
            if (r.ok) setMensagem('')
            return r
          })}
        >
          {ocupado === 'commit' ? 'commitando…' : 'Commit'}
        </button>
        <button
          className="btn pequeno"
          disabled={ocupado !== '' || !ligado}
          title={ligado ? 'git push' : 'Cole o link do repositório primeiro'}
          onClick={() => void fazer('push', () => window.vaultApi.git.push(raiz, sub))}
        >
          {ocupado === 'push' ? 'enviando…' : 'Push'}
        </button>
      </div>

      {recado && <pre className="git-recado" data-erro={!recado.ok}>{recado.texto}</pre>}
    </div>
  )
}
