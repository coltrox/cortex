import { useEffect, useMemo, useRef, useState } from 'react'
import type { NoteRow } from '../../shared/types'

type Props = {
  notas: NoteRow[]
  onEscolher: (path: string) => void
  onFechar: () => void
}

/**
 * Abertura rápida por Ctrl+K.
 *
 * A busca é feita sobre a lista já em memória, não pelo canal `search:fulltext` —
 * abrir uma nota pelo nome não deve depender de ida ao processo principal a cada
 * tecla. Busca no corpo das notas é outra função, e entra depois.
 */
export function Paleta({ notas, onEscolher, onFechar }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const achados = useMemo(() => {
    const termo = q.trim().toLowerCase()
    const base = termo
      ? notas.filter(n =>
          n.title.toLowerCase().includes(termo) || n.path.toLowerCase().includes(termo))
      : notas
    return base.slice(0, 40)
  }, [notas, q])

  useEffect(() => { setSel(0) }, [q])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel(s => Math.min(s + 1, achados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = achados[sel]
      if (alvo) onEscolher(alvo.path)
    }
  }

  return (
    <div className="paleta-fundo" onClick={onFechar}>
      <div className="paleta" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Abrir nota…"
        />
        <div className="paleta-lista">
          {achados.length === 0 && <div className="vazio">Nenhuma nota com esse nome.</div>}
          {achados.map((n, i) => (
            <button
              key={n.path}
              className="paleta-item"
              data-sel={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => onEscolher(n.path)}
            >
              <span>{n.title}</span>
              <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
              <span className="paleta-caminho">{n.path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
