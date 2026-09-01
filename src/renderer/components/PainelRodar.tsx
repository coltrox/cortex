import { useEffect, useRef, useState } from 'react'

import type { ProcessoInfo } from '../../shared/types'

/** De quanto em quanto tempo a tela busca a saída de quem está rodando. */
const INTERVALO_MS = 800

/**
 * Rodar o projeto de dentro do Cortex.
 *
 * Os botões vêm dos scripts do `package.json` daquele projeto — não há campo
 * de comando livre, e o processo principal recusa qualquer script que não
 * esteja lá. É o que separa "botão de atalho" de "executar o que a tela
 * mandar".
 *
 * Quando o servidor sobe e imprime um endereço, ele vira um link. É o caminho
 * curto: aperta rodar, aparece na tela.
 */
export function PainelRodar({ raiz, sub }: { raiz: string; sub: string }) {
  const [scripts, setScripts] = useState<string[]>([])
  const [rodando, setRodando] = useState<ProcessoInfo[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<string[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    void window.vaultApi.scriptsDoProjeto(raiz, sub)
      .then(r => { if (vivo) setScripts(r.scripts) })
      .catch(() => { if (vivo) setScripts([]) })
    return () => { vivo = false }
  }, [raiz, sub])

  // Um relógio só, e só enquanto há algo rodando ou uma aba aberta: sem a
  // segunda condição isto ficaria batendo no processo principal o dia inteiro
  // para nada.
  useEffect(() => {
    if (rodando.length === 0 && !aberto) return
    let vivo = true
    const tique = async (): Promise<void> => {
      try {
        const r = await window.vaultApi.listarProcessos()
        if (!vivo) return
        setRodando(r.processos.filter(p => p.raiz === raiz))
        if (aberto) {
          const s = await window.vaultApi.saidaDoProcesso(aberto)
          if (vivo) setLinhas(s.linhas)
        }
      } catch {
        // A janela pode estar fechando. Nada a fazer, e nada a mostrar.
      }
    }
    const t = setInterval(() => void tique(), INTERVALO_MS)
    void tique()
    return () => { vivo = false; clearInterval(t) }
  }, [rodando.length, aberto, raiz])

  // Rola para o fim quando chega linha nova, como um terminal de verdade.
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [linhas])

  const rodar = async (script: string): Promise<void> => {
    setAviso(null)
    try {
      const p = await window.vaultApi.rodarScript(raiz, script, sub)
      setRodando(r => [...r.filter(x => x.id !== p.id), p])
      setAberto(p.id)
      setLinhas([])
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não deu para rodar')
    }
  }

  const abrirVsCode = async (): Promise<void> => {
    setAviso(null)
    const r = await window.vaultApi.abrirNoVsCode(raiz, sub)
    if (!r.ok) setAviso(r.motivo ?? 'não deu para abrir o VS Code')
  }

  const ativos = rodando.filter(p => p.saiu === null)
  const proc = rodando.find(p => p.id === aberto) ?? null

  return (
    <div className="rodar">
      <div className="rodar-botoes">
        {scripts.length === 0 && (
          <span className="form-dica">Sem package.json nesta pasta — nada para rodar.</span>
        )}
        {scripts.map(s => (
          <button key={s} className="btn" onClick={() => void rodar(s)}>
            {s === 'dev' ? 'Rodar (npm run dev)' : 'npm run ' + s}
          </button>
        ))}
        <button className="btn-fantasma" onClick={() => void abrirVsCode()}>
          Abrir no VS Code
        </button>
      </div>

      {aviso && <div className="aviso">{aviso}</div>}

      {rodando.length > 0 && (
        <div className="rodar-lista">
          {rodando.map(p => (
            <button
              key={p.id}
              className={'rodar-aba ' + (p.id === aberto ? 'ativa' : '')}
              onClick={() => { setAberto(p.id); setLinhas([]) }}
            >
              <span className={'rodar-ponto ' + (p.saiu === null ? 'vivo' : '')} />
              {p.script}
              {p.saiu !== null && <em> · saiu ({p.saiu})</em>}
            </button>
          ))}
          {ativos.length === 0 && (
            <button
              className="btn-fantasma"
              onClick={() => void window.vaultApi.limparEncerrados()
                .then(r => {
                  setRodando(r.processos.filter(x => x.raiz === raiz))
                  setAberto(null)
                })}
            >
              limpar
            </button>
          )}
        </div>
      )}

      {proc && (
        <div className="rodar-saida">
          <div className="rodar-saida-topo">
            {proc.url && (
              // O endereço só aparece depois que o servidor o imprime — é o
              // sinal de que ele subiu de verdade, melhor do que um "iniciado".
              <a href={proc.url} target="_blank" rel="noreferrer" className="rodar-url">
                {proc.url}
              </a>
            )}
            {proc.saiu === null && (
              <button
                className="btn-fantasma"
                onClick={() => void window.vaultApi.pararProcesso(proc.id)}
              >
                Parar
              </button>
            )}
          </div>
          <pre className="rodar-linhas">
            {linhas.join('\n') || 'esperando a primeira linha…'}
            <div ref={fim} />
          </pre>
        </div>
      )}
    </div>
  )
}
