import { useEffect, useState } from 'react'
import type { ProcessoInfo } from '../../shared/types'
import { SaidaProcesso } from './PainelRodar'

/** De quanto em quanto tempo o botão confere se há algo rodando. */
const INTERVALO_MS = 2000

const pastaDe = (raiz: string): string => raiz.split(/[\\/]/).filter(Boolean).pop() ?? raiz

/**
 * O terminal que continua existindo fora da lente Dev.
 *
 * Os processos sempre seguiram rodando no processo principal quando a pessoa
 * trocava de área — o que sumia era a TELA deles, que morava dentro do painel
 * do Dev e ia embora junto com ele. Este botão fica no canto de qualquer área
 * enquanto houver um processo, rodando ou encerrado, para ler.
 */
export function TerminalFlutuante() {
  const [processos, setProcessos] = useState<ProcessoInfo[]>([])
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const tique = async (): Promise<void> => {
      try {
        const r = await window.vaultApi.listarProcessos()
        if (vivo) setProcessos(r.processos)
      } catch {
        // A janela pode estar fechando.
      }
    }
    void tique()
    const t = setInterval(() => void tique(), INTERVALO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  if (processos.length === 0) return null

  const vivos = processos.filter(p => p.saiu === null)
  const proc = processos.find(p => p.id === atual)
    ?? vivos[vivos.length - 1]
    ?? processos[processos.length - 1]

  return (
    <>
      {aberto && (
        <div className="terminal-flutuante" role="dialog" aria-label="Terminal do Cortex">
          <div className="terminal-flutuante-topo">
            <div className="rodar-lista">
              {processos.map(p => (
                <button
                  key={p.id}
                  className={'rodar-aba ' + (p.id === proc.id ? 'ativa' : '')}
                  title={p.raiz}
                  onClick={() => setAtual(p.id)}
                >
                  <span className={'rodar-ponto ' + (p.saiu === null ? 'vivo' : '')} />
                  {p.script}
                  <em> · {pastaDe(p.raiz)}</em>
                  {p.saiu !== null && <em> · saiu ({p.saiu})</em>}
                </button>
              ))}
              {vivos.length < processos.length && (
                <button
                  className="btn-fantasma"
                  onClick={() => void window.vaultApi.limparEncerrados()
                    .then(r => { setProcessos(r.processos); setAtual(null) })}
                >
                  limpar
                </button>
              )}
            </div>
            <button className="btn-icone" title="Esconder" onClick={() => setAberto(false)}>×</button>
          </div>
          <SaidaProcesso key={proc.id} proc={proc} />
        </div>
      )}
      <button
        className="terminal-botao"
        aria-expanded={aberto}
        title="Terminal do Cortex"
        onClick={() => setAberto(a => !a)}
      >
        <span className={'rodar-ponto ' + (vivos.length > 0 ? 'vivo' : '')} />
        Terminal{vivos.length > 0 ? ` · ${vivos.length} rodando` : ''}
      </button>
    </>
  )
}
