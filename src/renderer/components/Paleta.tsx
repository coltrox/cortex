import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { NoteComCampos } from '../tipos'
import { txt } from './base'

/**
 * Paleta de comandos (Ctrl+K).
 *
 * Duas coisas no mesmo campo: FAZER (nova tarefa, registrar gasto…) e ACHAR
 * (notas, lentes). Sem digitar nada aparecem as ações e as notas mexidas por
 * último; digitando, as ações que casam vêm primeiro, porque são poucas e é
 * o que se quer quando o termo é um verbo.
 *
 * A busca procura no título, no caminho, no tipo e em alguns campos que são a
 * razão de a pessoa estar buscando: o `arquivo` de um documento (digitar "rg"
 * tem que achar o RG) e o `usuario` de uma conta. Um termo que não acha nada
 * vira o atalho para criar uma anotação com aquele nome.
 */

type Destino =
  | { kind: 'comando'; id: string; nome: string; dica: string }
  | { kind: 'nota'; nota: NoteComCampos }
  | { kind: 'lente'; id: string; nome: string }
  | { kind: 'criar'; termo: string }

/**
 * Os ids são os que o App entende em `aoComando`: tipo de formulário, ou um
 * dos especiais (treino, gasto, pomodoro, configuracoes). `palavras` são os
 * outros jeitos de pedir a mesma coisa.
 */
export const COMANDOS: { id: string; nome: string; dica: string; palavras: string }[] = [
  { id: 'tarefa', nome: 'Nova tarefa', dica: 'Estudos', palavras: 'todo afazer prazo' },
  { id: 'anotacao', nome: 'Nova anotação', dica: 'Vida', palavras: 'nota lembrete ideia' },
  { id: 'gasto', nome: 'Registrar gasto', dica: 'Grana', palavras: 'transação dinheiro despesa receita' },
  { id: 'treino', nome: 'Registrar treino', dica: 'Saúde', palavras: 'academia sessão musculação' },
  { id: 'medida', nome: 'Registrar peso', dica: 'Saúde', palavras: 'medida balança corpo' },
  { id: 'evento', nome: 'Criar compromisso', dica: 'Agenda', palavras: 'evento reunião consulta agenda' },
  { id: 'rotina', nome: 'Nova tarefa diária', dica: 'Hoje', palavras: 'rotina hábito diário' },
  { id: 'objetivo', nome: 'Nova meta', dica: 'Vida', palavras: 'objetivo' },
  { id: 'acontecimento', nome: 'Registrar acontecimento', dica: 'Agenda', palavras: 'aconteceu fato lembrar registro dia' },
  { id: 'compra', nome: 'Adicionar à lista de compras', dica: 'Vida', palavras: 'comprar mercado' },
  { id: 'pomodoro', nome: 'Abrir Pomodoro', dica: 'Estudos', palavras: 'temporizador foco timer estudar' },
  { id: 'configuracoes', nome: 'Abrir configurações', dica: 'App', palavras: 'ajustes tema senha celular claude' }
]

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
 * Os comandos que casam com o termo. Cada palavra digitada precisa aparecer
 * no nome, na área ou nas palavras-chave: "reg gas" acha "Registrar gasto".
 */
export function filtrarComandos(q: string): typeof COMANDOS {
  const partes = dobra(q.trim()).split(/\s+/).filter(Boolean)
  if (partes.length === 0) return COMANDOS
  return COMANDOS.filter(c => {
    const alvo = dobra(`${c.nome} ${c.palavras} ${c.dica}`)
    return partes.every(p => alvo.includes(p))
  })
}

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

  for (const k of ['usuario', 'categoria', 'materia', 'project', 'autor', 'papel', 'texto']) {
    if (dobra(txt(n.campos[k])).includes(q)) return 6
  }
  return null
}

const ROTULO: Record<string, string> = {
  materia: 'conteúdo', 'treino-modelo': 'treino', sessao: 'treino feito',
  'meta-cofre': 'meta do porquinho', diario: 'diário'
}

export function Paleta({
  notas, aoEscolher, aoIrParaLente, aoCriar, aoComando, aoFechar
}: {
  notas: NoteComCampos[]
  aoEscolher: (path: string) => void
  aoIrParaLente: (id: string) => void
  aoCriar: (titulo: string) => void
  aoComando: (id: string) => void
  aoFechar: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => { campo.current?.focus() }, [])

  const termo = dobra(q.trim())

  const resultados = useMemo<Destino[]>(() => {
    const comandos: Destino[] = filtrarComandos(q)
      .map(c => ({ kind: 'comando' as const, id: c.id, nome: c.nome, dica: c.dica }))

    if (!termo) {
      // Sem busca: as ações, e depois as notas mexidas por último.
      const recentes = [...notas]
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 8)
        .map(nota => ({ kind: 'nota' as const, nota }))
      return [...comandos, ...recentes]
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

    return [...comandos, ...lentes, ...achadas, { kind: 'criar' as const, termo: q.trim() }]
  }, [notas, q, termo])

  useEffect(() => { setI(0) }, [q])

  // Manter o item selecionado visível quando se navega com as setas.
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [i])

  const escolher = (d: Destino): void => {
    // Fecha antes: o comando abre outro modal, e dois por cima um do outro
    // brigariam pelo Esc.
    aoFechar()
    if (d.kind === 'comando') aoComando(d.id)
    else if (d.kind === 'nota') aoEscolher(d.nota.path)
    else if (d.kind === 'lente') aoIrParaLente(d.id)
    else aoCriar(d.termo)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, resultados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); const d = resultados[i]; if (d) escolher(d) }
    if (e.key === 'Escape') { e.preventDefault(); aoFechar() }
  }

  const secaoDe = (d: Destino): string => {
    if (d.kind === 'comando') return 'Ações'
    if (d.kind === 'lente') return 'Ir para'
    if (d.kind === 'criar') return 'Criar'
    return termo ? 'Notas' : 'Recentes'
  }

  const itens: ReactNode[] = []
  resultados.forEach((d, j) => {
    const sel = j === i
    const secao = secaoDe(d)
    if (j === 0 || secaoDe(resultados[j - 1]) !== secao) {
      itens.push(<div className="paleta-secao" key={`s-${secao}`}>{secao}</div>)
    }
    const props = {
      className: `paleta-item ${d.kind === 'criar' ? 'criar' : ''} ${d.kind === 'comando' ? 'comando' : ''}`,
      'aria-selected': sel,
      onMouseEnter: () => setI(j),
      onClick: () => escolher(d)
    }
    if (d.kind === 'comando') {
      itens.push(
        <button key={`c-${d.id}`} {...props}>
          <span className="paleta-linha">
            <span className="paleta-sinal" aria-hidden="true">›</span>
            <span className="paleta-titulo">{d.nome}</span>
            <span className="tipo">{d.dica}</span>
          </span>
        </button>
      )
    } else if (d.kind === 'lente') {
      itens.push(
        <button key={`l-${d.id}`} {...props}>
          <span className="paleta-linha">
            <span className="paleta-titulo">Ir para {d.nome}</span>
            <span className="tipo">lente</span>
          </span>
        </button>
      )
    } else if (d.kind === 'criar') {
      itens.push(
        <button key="criar" {...props}>
          <span className="paleta-linha">
            <span className="paleta-titulo">Criar anotação &ldquo;{d.termo}&rdquo;</span>
            <span className="tipo">novo</span>
          </span>
        </button>
      )
    } else {
      const n = d.nota
      itens.push(
        <button key={n.path} {...props}>
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
    }
  })

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="paleta" onClick={e => e.stopPropagation()}>
        <input
          ref={campo}
          className="paleta-campo"
          placeholder="O que você quer fazer? Buscar nota, nova tarefa, registrar gasto…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
        />

        <div className="paleta-lista" ref={listaRef}>{itens}</div>

        <div className="paleta-rodape">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> executar</span>
          <span><kbd>Esc</kbd> fechar</span>
          <span className="paleta-conta">{notas.length} notas no vault</span>
        </div>
      </div>
    </div>
  )
}
