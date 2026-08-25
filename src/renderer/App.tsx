import { useEffect, useState, type ReactElement } from 'react'
import { useVault, agruparPorPasta, LENTES_DE_EDICAO, type Lente } from './useVault'
import { hojeISO } from './tipos'
import { SUBS } from './subnav'
import {
  IconeHoje, IconeNotas, IconeVida, IconeSaude,
  IconeDev, IconeConhecimento, IconeFinancas, IconeCalendario
} from './icons'
import { Paleta } from './components/Paleta'
import { Calendario } from './components/Calendario'
import {
  LenteHoje, LenteVida, LenteSaude, LenteEstudos, LenteGrana
} from './components/lentes'

const LENTES: { id: Lente; nome: string; Icone: (p: { size?: number }) => ReactElement }[] = [
  { id: 'hoje',         nome: 'Hoje',    Icone: IconeHoje },
  { id: 'notas',        nome: 'Notas',   Icone: IconeNotas },
  { id: 'vida',         nome: 'Vida',    Icone: IconeVida },
  { id: 'saude',        nome: 'Saúde',   Icone: IconeSaude },
  { id: 'dev',          nome: 'Dev',     Icone: IconeDev },
  { id: 'conhecimento', nome: 'Estudos', Icone: IconeConhecimento },
  { id: 'financas',     nome: 'Grana',   Icone: IconeFinancas },
  { id: 'calendario',   nome: 'Agenda',  Icone: IconeCalendario }
]

export function App() {
  const v = useVault()
  const [paleta, setPaleta] = useState(false)
  const hoje = hojeISO()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta(p => !p)
      }
      if (e.key === 'Escape') setPaleta(false)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void v.salvar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [v])

  if (!v.root) {
    return (
      <div className="abertura">
        <h1>Cortex</h1>
        <p>Seu vault de markdown, indexado e navegável. Os arquivos continuam sendo a verdade.</p>
        {v.erro && <div className="erro">{v.erro}</div>}
        <button className="btn" onClick={() => void v.escolher()}>Abrir pasta do vault</button>
      </div>
    )
  }

  const edicao = LENTES_DE_EDICAO.includes(v.lente)
  const grupos = agruparPorPasta(v.visiveis)
  const lenteAtual = LENTES.find(l => l.id === v.lente)
  const subs = edicao ? null : SUBS[v.lente]
  const abrir = (p: string) => void v.abrir(p)

  function view(): ReactElement {
    switch (v.lente) {
      case 'hoje':         return <LenteHoje notas={v.notas} hoje={hoje} aoAbrir={abrir} />
      case 'vida':         return <LenteVida notas={v.notas} sub={v.sub} hoje={hoje} aoAbrir={abrir} />
      case 'saude':        return <LenteSaude notas={v.notas} sub={v.sub} hoje={hoje} aoAbrir={abrir} />
      case 'conhecimento': return <LenteEstudos notas={v.notas} sub={v.sub} hoje={hoje} aoAbrir={abrir} />
      case 'financas':     return <LenteGrana notas={v.notas} sub={v.sub} hoje={hoje} aoAbrir={abrir} />
      case 'calendario':   return <Calendario notas={v.notas} hoje={hoje} aoAbrir={abrir} />
      default:             return <></>
    }
  }

  return (
    <>
      <div className={edicao ? 'shell' : (subs ? 'shell com-subnav' : 'shell so-lente')}>
        <nav className="rail">
          {LENTES.map(({ id, nome, Icone }) => (
            <button
              key={id}
              className="rail-item"
              aria-current={v.lente === id}
              title={nome}
              onClick={() => v.setLente(id)}
            >
              <Icone />
              <span>{nome}</span>
            </button>
          ))}
        </nav>

        {edicao && (
          <aside className="sidebar">
            <div className="lente-nome">
              {lenteAtual?.nome} · {v.visiveis.length} {v.visiveis.length === 1 ? 'nota' : 'notas'}
            </div>
            <input
              className="busca"
              placeholder="Filtrar…"
              value={v.filtro}
              onChange={e => v.setFiltro(e.target.value)}
            />
            {grupos.length === 0 && <div className="vazio">Nada aqui com esse filtro.</div>}
            {grupos.map(([pasta, notas]) => (
              <div key={pasta}>
                <div className="pasta">{pasta}</div>
                {notas.map(n => (
                  <button
                    key={n.path}
                    className="nota"
                    aria-current={n.path === v.aberta}
                    onClick={() => void v.abrir(n.path)}
                  >
                    <span className="nota-titulo">{n.title}</span>
                    <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>
        )}

        {subs && (
          <aside className="subnav">
            <div className="lente-nome">{lenteAtual?.nome}</div>
            {subs.map(s => (
              <button
                key={s.id}
                className="subnav-item"
                aria-current={v.sub === s.id}
                onClick={() => v.setSub(s.id)}
              >
                {s.nome}
              </button>
            ))}
          </aside>
        )}

        <main className="main">
          <div className="topo">
            <span className="caminho">
              {edicao ? (v.aberta ?? 'nenhuma nota aberta') : lenteAtual?.nome}
            </span>
            <div className="topo-dir">
              {edicao && v.aberta && (
                <span className="salvo" data-sujo={v.sujo}>
                  {v.sujo ? 'não salvo' : 'salvo'}
                </span>
              )}
              <button className="btn-fantasma" onClick={() => setPaleta(true)}>
                Buscar <kbd>Ctrl K</kbd>
              </button>
              {edicao && (
                <button className="btn" onClick={() => void v.salvar()} disabled={!v.aberta || !v.sujo}>
                  Salvar
                </button>
              )}
            </div>
          </div>

          {v.erro && <div className="erro">{v.erro}</div>}

          {edicao ? (
            <div className="editor-area">
              {v.notaAberta && (
                <>
                  <h1 className="titulo-nota">{v.notaAberta.title}</h1>
                  <div className="meta-nota">
                    {v.notaAberta.tipo}
                    {v.notaAberta.project ? ` · ${v.notaAberta.project}` : ''}
                    {v.notaAberta.created ? ` · criada ${v.notaAberta.created}` : ''}
                  </div>
                </>
              )}
              <textarea
                className="editor"
                value={v.conteudo}
                onChange={e => v.setConteudo(e.target.value)}
                disabled={!v.aberta}
                spellCheck={false}
                placeholder={v.aberta ? '' : 'Escolha uma nota na lista à esquerda.'}
              />
            </div>
          ) : view()}
        </main>

        {edicao && (
          <aside className="aside">
            <div className="aside-titulo">Dependências da rede</div>
            {v.saindo.length === 0 && <div className="vazio">Nenhum link de saída.</div>}
            {v.saindo.map((l, i) => (
              <button
                key={`${l.dst}-${i}`}
                className="link"
                data-quebrado={l.resolvedPath === null}
                onClick={() => void v.abrirLink(l)}
                title={l.resolvedPath ?? 'esta nota ainda não existe'}
              >
                {l.dst}
              </button>
            ))}

            <div className="aside-titulo">Apontam para esta</div>
            {v.entrando.length === 0 && <div className="vazio">Nenhum backlink.</div>}
            {v.entrando.map(b => (
              <button key={b.path} className="link" onClick={() => void v.abrir(b.path)}>
                {b.title}
              </button>
            ))}
          </aside>
        )}
      </div>

      {paleta && (
        <Paleta
          notas={v.notas}
          onEscolher={p => { void v.abrir(p); setPaleta(false) }}
          onFechar={() => setPaleta(false)}
        />
      )}
    </>
  )
}
