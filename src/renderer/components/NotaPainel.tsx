import { useEffect, useRef } from 'react'
import type { NoteComCampos } from '../tipos'
import type { Link, Backlink } from '../useVault'
import { Markdown } from './Markdown'

/**
 * A nota aberta.
 *
 * Aparece POR CIMA da lente em que você estava — Estudos continua Estudos, Dev
 * continua Dev. Antes existia uma lente "Notas" para onde o app te jogava ao
 * clicar em qualquer coisa; era desorientador, e resolver isso é o motivo
 * deste componente existir.
 *
 * Dois modos: ler (markdown renderizado, com fórmulas) e escrever (texto cru).
 * O markdown é a verdade em disco nos dois.
 */

type Props = {
  nota: NoteComCampos | null
  caminho: string
  conteudo: string
  editando: boolean
  sujo: boolean
  saindo: Link[]
  entrando: Backlink[]
  voltarPara: string
  aoVoltar: () => void
  aoEditar: (v: boolean) => void
  aoMudar: (texto: string) => void
  aoSalvar: () => void
  aoAbrirNome: (alvo: string) => void
  aoAbrirPath: (p: string) => void
  aoExcluir?: () => void
}

/** Junta links repetidos e conta — três menções à mesma nota são uma linha. */
function agrupar(links: Link[]): { dst: string; alvo: string | null; vezes: number }[] {
  const m = new Map<string, { dst: string; alvo: string | null; vezes: number }>()
  for (const l of links) {
    const atual = m.get(l.dst)
    if (atual) atual.vezes++
    else m.set(l.dst, { dst: l.dst, alvo: l.resolvedPath, vezes: 1 })
  }
  return [...m.values()]
}

export function NotaPainel({
  nota, caminho, conteudo, editando, sujo, saindo, entrando,
  voltarPara, aoVoltar, aoEditar, aoMudar, aoSalvar, aoAbrirNome, aoAbrirPath, aoExcluir
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editando) area.current?.focus()
  }, [editando])

  /** Marca/desmarca `- [ ]` na linha exata, sem tocar no resto do arquivo. */
  const marcarTarefa = (linha: number, feito: boolean): void => {
    const linhas = conteudo.split(/\r\n|\n/)
    if (linha >= linhas.length) return
    linhas[linha] = linhas[linha].replace(/\[([ xX])\]/, feito ? '[x]' : '[ ]')
    aoMudar(linhas.join('\n'))
  }

  const links = agrupar(saindo)

  return (
    <div className="nota-painel">
      <div className="nota-trilha">
        <button className="btn-fantasma" onClick={aoVoltar}>‹ {voltarPara}</button>
        <span className="nota-caminho">{caminho}</span>
        <span className="nota-trilha-dir">
          {sujo && <span className="salvo" data-sujo>não salvo</span>}
          <button className="btn-fantasma" onClick={() => aoEditar(!editando)}>
            {editando ? 'Ler' : 'Escrever'}
          </button>
          {editando && (
            <button className="btn" onClick={aoSalvar} disabled={!sujo}>Salvar</button>
          )}
          {aoExcluir && (
            <button className="btn-icone perigo" title="Excluir nota" onClick={aoExcluir}>×</button>
          )}
        </span>
      </div>

      <div className="nota-corpo">
        <div className="nota-texto">
          {nota && (
            <>
              <h1 className="titulo-nota">{nota.title}</h1>
              <div className="meta-nota">
                {nota.tipo}
                {nota.project ? ` · ${nota.project}` : ''}
                {nota.date ? ` · ${nota.date}` : ''}
              </div>
            </>
          )}

          {editando ? (
            <textarea
              ref={area}
              className="editor"
              value={conteudo}
              onChange={e => aoMudar(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <Markdown
              texto={conteudo.replace(/^---\n[\s\S]*?\n---\n?/, '')}
              aoAbrirLink={aoAbrirNome}
              aoMarcarTarefa={marcarTarefa}
            />
          )}
        </div>

        <aside className="nota-lado">
          <div className="aside-titulo">Dependências da rede</div>
          {links.length === 0 && <div className="vazio">Nenhum link de saída.</div>}
          {links.map(l => (
            <button
              key={l.dst}
              className="link"
              data-quebrado={l.alvo === null}
              onClick={() => (l.alvo ? aoAbrirPath(l.alvo) : aoAbrirNome(l.dst))}
              title={l.alvo ?? 'esta nota ainda não existe'}
            >
              <span>{l.dst}</span>
              {l.vezes > 1 && <span className="link-vezes">{l.vezes}</span>}
            </button>
          ))}

          <div className="aside-titulo">Apontam para esta</div>
          {entrando.length === 0 && <div className="vazio">Nenhum backlink.</div>}
          {entrando.map(b => (
            <button key={b.path} className="link" onClick={() => aoAbrirPath(b.path)}>
              <span>{b.title}</span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  )
}
