import { useRef, useState } from 'react'

/**
 * O terminal de dentro do Cortex.
 *
 * Pedido do dono: dar um comando na pasta do projeto sem abrir o console do
 * Windows. A saída não fica aqui — ela aparece na lista de terminais logo
 * acima, a mesma de `npm run dev`, com o ▴ de encolher e o × de fechar.
 * Um lugar só para ler o que está rodando.
 *
 * O botão do console do sistema continua, ao lado: quando o comando quer uma
 * resposta ("deseja continuar? [S/N]"), é para lá que se vai — aqui não há
 * como digitar de volta para o processo.
 */
export function PainelTerminal({ raiz, sub, aoSistema, aoRodou }: {
  raiz: string
  sub: string
  /** Abrir o console do Windows na mesma pasta (o caminho de escape). */
  aoSistema: () => void
  /** Avisa quem mostra a lista de processos que nasceu mais um. */
  aoRodou?: () => void
}) {
  const [linha, setLinha] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  /** Os últimos comandos, para as setas ↑/↓ — é o que se espera de um terminal. */
  const anteriores = useRef<string[]>([])
  const [ondeNoHistorico, setOndeNoHistorico] = useState<number | null>(null)

  const rodar = async (): Promise<void> => {
    const cmd = linha.trim()
    if (cmd === '') return
    setAviso(null)
    try {
      await window.vaultApi.executarComando(raiz, cmd, sub)
      anteriores.current = [cmd, ...anteriores.current.filter(c => c !== cmd)].slice(0, 30)
      setOndeNoHistorico(null)
      setLinha('')
      aoRodou?.()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não deu para rodar')
    }
  }

  /** Anda no histórico: ↑ vai para o mais antigo, ↓ volta até a linha vazia. */
  const andar = (passo: 1 | -1): void => {
    const lista = anteriores.current
    if (lista.length === 0) return
    const atual = ondeNoHistorico === null ? -1 : ondeNoHistorico
    const novo = Math.min(lista.length - 1, Math.max(-1, atual + passo))
    setOndeNoHistorico(novo < 0 ? null : novo)
    setLinha(novo < 0 ? '' : lista[novo])
  }

  return (
    <div className="terminal-embutido">
      <div className="terminal-linha">
        <span className="terminal-prompt" aria-hidden="true">›</span>
        <input
          className="terminal-campo"
          value={linha}
          placeholder={`comando em ${sub ? sub.split('/').pop() : 'raiz do projeto'}`}
          aria-label="Comando para rodar nesta pasta"
          spellCheck={false}
          autoFocus
          onChange={e => { setLinha(e.target.value); setOndeNoHistorico(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void rodar() }
            else if (e.key === 'ArrowUp') { e.preventDefault(); andar(1) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); andar(-1) }
          }}
        />
        <button className="btn-fantasma pequeno" onClick={() => void rodar()}>Rodar</button>
        <button
          className="btn-fantasma pequeno"
          title="Abrir o console do Windows nesta pasta — para comandos que fazem perguntas"
          onClick={aoSistema}
        >No sistema</button>
      </div>
      {aviso && <div className="aviso">{aviso}</div>}
      <p className="form-dica">
        A saída aparece na lista de terminais acima. Aqui não dá para responder
        a perguntas do comando — para isso, o console do sistema.
      </p>
    </div>
  )
}
