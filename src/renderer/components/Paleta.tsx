import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { NoteComCampos } from '../tipos'
import { txt } from './base'

/**
 * Busca rápida.
 *
 * Procura no título, no caminho, no tipo e em alguns campos que são a razão
 * de a pessoa estar buscando: o `arquivo` de um documento (digitar "rg" tem
 * que achar o RG) e o `usuario` de uma conta.
 *
 * Também navega: digitar "saúde" oferece ir para a lente, e um termo que não
 * acha nada vira o atalho para criar uma nota com aquele nome.
 */

type Destino =
  | { kind: 'nota'; nota: NoteComCampos }
  | { kind: 'lente'; id: string; nome: string }
  | { kind: 'criar'; termo: string }

const LENTES = [
  { id: 'hoje', nome: 'Hoje' },
  { id: 'vida', nome: 'Vida' },
  { id: 'saude', nome: 'Saúde' },
  { id: 'dev', nome: 'Dev' },
  { id: 'conhecimento', nome: 'Estudos' },
  { id: 'financas', nome: 'Grana' },
  { id: 'calendario', nome: 'Agenda' }
]

/** Tira acento para que "redacao" ache "Redação". */
const dobra = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Pontua um acerto. Quanto menor, melhor.
 * Começo do título ganha de meio do título, que ganha de caminho, que ganha
 * de campo — é a ordem em que a pessoa espera ver o que procurou.
 */
function pontuar(n: NoteComCampos, q: string): number | null {
  const titulo = dobra(n.title)
  if (titulo === q) return 0
  if (titulo.startsWith(q)) return 1
  if (titulo.includes(q)) return 2

  const arquivo = dobra(txt(n.campos.arquivo))
  if (arquivo && arquivo.includes(q)) return 3

  if (dobra(n.path).includes(q)) return 4
  if (dobra(n.tipo).includes(q)) return 5

  for (const k of ['usuario', 'categoria', 'materia', 'project', 'autor', 'papel']) {
    if (dobra(txt(n.campos[k])).includes(q)) return 6
  }
  return null
}

const ROTULO: Record<string, string> = {
  materia: 'conteúdo', 'treino-modelo': 'treino', sessao: 'treino feito',
  'meta-cofre': 'meta do porquinho', diario: 'diário'
}

export function Paleta({
  notas, aoEscolher, aoIrParaLente, aoCriar, aoFechar
}: {
  notas: NoteComCampos[]
  aoEscolher: (path: string) => void
  aoIrParaLente: (id: string) => void
  aoCriar: (titulo: string) => void
  aoFechar: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => { campo.current?.focus() }, [])

  const resultados = useMemo<Destino[]>(() => {
    const termo = dobra(q.trim())
    if (!termo) {
      // Sem busca: as notas mexidas por último. É o que se quer quase sempre.
      return [...notas]
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 12)
        .map(nota => ({ kind: 'nota' as const, nota }))
    }

    const lentes: Destino[] = LENTES
      .filter(l => dobra(l.nome).includes(termo))
      .map(l => ({ kind: 'lente' as const, id: l.id, nome: l.nome }))

    const achadas = notas
      .map(nota => ({ nota, p: pontuar(nota, termo) }))
      .filter((r): r is { nota: NoteComCampos; p: number } => r.p !== null)
      .sort((a, b) => (a.p - b.p) || (b.nota.mtime - a.nota.mtime))
      .slice(0, 40)
      .map(r => ({ kind: 'nota' as const, nota: r.nota }))

    return [...lentes, ...achadas, { kind: 'criar' as const, termo: q.trim() }]
  }, [notas, q])

  useEffect(() => { setI(0) }, [q])

  // Manter o item selecionado visível quando se navega com as setas.
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [i])

  const escolher = (d: Destino): void => {
    if (d.kind === 'nota') aoEscolher(d.nota.path)
    else if (d.kind === 'lente') aoIrParaLente(d.id)
    else aoCriar(d.termo)
    aoFechar()
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, resultados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); const d = resultados[i]; if (d) escolher(d) }
    if (e.key === 'Escape') { e.preventDefault(); aoFechar() }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="paleta" onClick={e => e.stopPropagation()}>
        <input
          ref={campo}
          className="paleta-campo"
          placeholder="Buscar nota, documento, conta, lente…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
        />

        <div className="paleta-lista" ref={listaRef}>
          {resultados.map((d, j) => {
            const sel = j === i
            if (d.kind === 'lente') {
              return (
                <button key={`l-${d.id}`} className="paleta-item" aria-selected={sel}
                  onMouseEnter={() => setI(j)} onClick={() => escolher(d)}>
                  <span className="paleta-linha">
                    <span className="paleta-titulo">Ir para {d.nome}</span>
                    <span className="tipo">lente</span>
                  </span>
                </button>
              )
            }
            if (d.kind === 'criar') {
              return (
                <button key="criar" className="paleta-item criar" aria-selected={sel}
                  onMouseEnter={() => setI(j)} onClick={() => escolher(d)}>
                  <span className="paleta-linha">
                    <span className="paleta-titulo">Criar anotação &ldquo;{d.termo}&rdquo;</span>
                    <span className="tipo">novo</span>
                  </span>
                </button>
              )
            }
            const n = d.nota
            return (
              <button key={n.path} className="paleta-item" aria-selected={sel}
                onMouseEnter={() => setI(j)} onClick={() => escolher(d)}>
                <span className="paleta-linha">
                  <span className="paleta-titulo">{n.title}</span>
                  <span className="tipo" data-t={n.tipo}>{ROTULO[n.tipo] ?? n.tipo}</span>
                </span>
                <span className="paleta-caminho">
                  {n.path}
                  {txt(n.campos.arquivo) && ` · ${txt(n.campos.arquivo)}`}
                </span>
              </button>
            )
          })}
        </div>

        <div className="paleta-rodape">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> fechar</span>
          <span className="paleta-conta">{notas.length} notas no vault</span>
        </div>
      </div>
    </div>
  )
}
