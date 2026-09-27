import { useEffect, useRef, useState } from 'react'

import type { ProcessoInfo } from '../../shared/types'
import { SaidaProcesso } from './PainelRodar'

/**
 * O terminal de dentro do Cortex.
 *
 * É uma sessão de verdade, e não um comando de cada vez: o shell fica aberto
 * na pasta, e cada linha digitada vai para ele. Por isso o `cd` da linha
 * anterior ainda vale na seguinte — foi o que o dono pediu depois da primeira
 * versão, em que cada comando abria um terminal novo.
 *
 * Quem quiser outro terminal aperta **+ Terminal**; aí sim nasce um segundo,
 * com aba própria.
 *
 * O console do Windows continua no botão ao lado: aqui não dá para responder
 * a uma pergunta do comando ("deseja continuar? [S/N]"), porque por baixo há
 * a entrada do processo, não um terminal de verdade.
 */
export function PainelTerminal({ raiz, sub, aoSistema }: {
  raiz: string
  sub: string
  /** Abrir o console do Windows na mesma pasta (o caminho de escape). */
  aoSistema: () => void
}) {
  const [terminais, setTerminais] = useState<ProcessoInfo[]>([])
  const [atual, setAtual] = useState<string | null>(null)
  const [linha, setLinha] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  /** Os últimos comandos, para as setas ↑/↓ — é o que se espera de um terminal. */
  const anteriores = useRef<string[]>([])
  const [ondeNoHistorico, setOndeNoHistorico] = useState<number | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const abrir = async (): Promise<void> => {
    setAviso(null)
    try {
      const p = await window.vaultApi.abrirTerminalNoCortex(raiz, sub)
      setTerminais(t => [...t, p])
      setAtual(p.id)
      campo.current?.focus()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não deu para abrir o terminal')
    }
  }

  // O primeiro terminal nasce junto com o painel: abrir o terminal e ainda ter
  // de apertar "novo" seria um passo a troco de nada.
  useEffect(() => {
    if (terminais.length === 0) void abrir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * Clicou noutra pasta na árvore? O terminal vai junto.
   *
   * Pedido do dono: "quando clica em uma pasta, abre ela mas não vai para
   * ela". O terminal aberto recebe um `cd` — e o comando aparece na saída,
   * para ficar claro para onde ele andou.
   */
  useEffect(() => {
    if (!atual) return
    void window.vaultApi.terminalNaPasta(atual, raiz, sub).catch(() => {
      // Terminal já encerrado: o próximo que abrir já nasce na pasta certa.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, raiz])

  const mandar = async (): Promise<void> => {
    const cmd = linha.trim()
    if (cmd === '' || !atual) return
    setAviso(null)
    try {
      await window.vaultApi.enviarNoTerminal(atual, cmd)
      anteriores.current = [cmd, ...anteriores.current.filter(c => c !== cmd)].slice(0, 30)
      setOndeNoHistorico(null)
      setLinha('')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não deu para rodar')
    }
  }

  /** Anda no histórico: ↑ vai para o mais antigo, ↓ volta até a linha vazia. */
  const andar = (passo: 1 | -1): void => {
    const lista = anteriores.current
    if (lista.length === 0) return
    const onde = ondeNoHistorico === null ? -1 : ondeNoHistorico
    const novo = Math.min(lista.length - 1, Math.max(-1, onde + passo))
    setOndeNoHistorico(novo < 0 ? null : novo)
    setLinha(novo < 0 ? '' : lista[novo])
  }

  const fechar = async (p: ProcessoInfo): Promise<void> => {
    await window.vaultApi.pararProcesso(p.id).catch(() => {})
    await window.vaultApi.esquecerProcesso(p.id).catch(() => {})
    const sobram = terminais.filter(t => t.id !== p.id)
    setTerminais(sobram)
    setAtual(sobram[sobram.length - 1]?.id ?? null)
  }

  const proc = terminais.find(t => t.id === atual) ?? null

  return (
    <div className="terminal-embutido">
      <div className="terminal-abas">
        {terminais.map((t, i) => (
          <button
            key={t.id}
            className={'rodar-aba ' + (t.id === atual ? 'ativa' : '')}
            onClick={() => { setAtual(t.id); campo.current?.focus() }}
          >
            <span className="rodar-ponto vivo" />
            terminal {i + 1}
          </button>
        ))}
        <button className="btn-fantasma pequeno" onClick={() => void abrir()}>+ Terminal</button>
        <span className="rodar-saida-espaco" />
        <button
          className="btn-fantasma pequeno"
          title="Abrir o console do Windows nesta pasta — para comandos que fazem perguntas"
          onClick={aoSistema}
        >No sistema</button>
      </div>

      {proc && <SaidaProcesso key={proc.id} proc={proc} aoFechar={terminais.length > 1 ? fechar : undefined} />}

      <div className="terminal-linha">
        <span className="terminal-prompt" aria-hidden="true">›</span>
        <input
          ref={campo}
          className="terminal-campo"
          value={linha}
          placeholder={`comando em ${sub ? sub.split('/').pop() : 'raiz do projeto'}`}
          aria-label="Comando para rodar nesta pasta"
          spellCheck={false}
          autoFocus
          onChange={e => { setLinha(e.target.value); setOndeNoHistorico(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void mandar() }
            else if (e.key === 'ArrowUp') { e.preventDefault(); andar(1) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); andar(-1) }
          }}
        />
        <button className="btn-fantasma pequeno" onClick={() => void mandar()}>Rodar</button>
      </div>
      {aviso && <div className="aviso">{aviso}</div>}
    </div>
  )
}
