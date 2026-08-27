import { useEffect, useState, type ReactElement } from 'react'
import { useVault, type Lente } from './useVault'
import type { NoteComCampos } from './tipos'
import { hojeISO } from './tipos'
import { SUBS } from './subnav'
import { FORMULARIOS, ITENS } from './formularios'
import {
  IconeHoje, IconeVida, IconeSaude, IconeDev,
  IconeConhecimento, IconeFinancas, IconeCalendario
} from './icons'
import { Abertura, ModalAreas } from './components/Abertura'
import { Paleta } from './components/Paleta'
import { Calendario } from './components/Calendario'
import { NotaPainel } from './components/NotaPainel'
import { ModalFormulario } from './components/ModalFormulario'
import { RegistroTreino } from './components/RegistroTreino'
import { LenteHoje } from './components/LenteHoje'
import { LenteVida } from './components/LenteVida'
import { LenteSaude } from './components/LenteSaude'
import { LenteEstudos } from './components/LenteEstudos'
import { LenteGrana } from './components/LenteGrana'
import { LenteDev } from './components/LenteDev'

/** Engrenagem do rodapé do rail — reabre a escolha de áreas. */
function IconeAreas({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const LENTES: { id: Lente; nome: string; Icone: (p: { size?: number }) => ReactElement }[] = [
  { id: 'hoje',         nome: 'Hoje',    Icone: IconeHoje },
  { id: 'conhecimento', nome: 'Estudos', Icone: IconeConhecimento },
  { id: 'saude',        nome: 'Saúde',   Icone: IconeSaude },
  { id: 'financas',     nome: 'Grana',   Icone: IconeFinancas },
  { id: 'vida',         nome: 'Vida',    Icone: IconeVida },
  { id: 'dev',          nome: 'Dev',     Icone: IconeDev },
  { id: 'calendario',   nome: 'Agenda',  Icone: IconeCalendario }
]

export function App() {
  const v = useVault()
  const hoje = hojeISO()

  const [paleta, setPaleta] = useState(false)
  const [criando, setCriando] = useState<{ tipo: string; inicial?: Record<string, unknown> } | null>(null)
  const [alterando, setAlterando] = useState<NoteComCampos | null>(null)
  const [lancando, setLancando] = useState<{ item: string; dia: string } | null>(null)
  const [modal, setModal] = useState<{ id: string; ctx?: Record<string, unknown> } | null>(null)
  const [excluindo, setExcluindo] = useState<NoteComCampos | null>(null)
  const [ajustandoAreas, setAjustandoAreas] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta(p => !p)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void v.salvar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [v])

  // Abertura: escolher a pasta e, depois, as áreas. `escolheu` distingue
  // "marquei todas" de "nunca passei por aqui".
  if (!v.root || !v.config.escolheu) {
    return (
      <Abertura
        root={v.root}
        escolheu={v.config.escolheu}
        areasAtuais={v.config.areas}
        erro={v.erro}
        aoCriar={() => void v.criarVault()}
        aoEscolher={() => void v.escolher()}
        aoConfirmarAreas={areas => void v.salvarAreas(areas)}
      />
    )
  }

  const visiveis = LENTES.filter(l => l.id === 'hoje' || v.config.areas.includes(l.id))
  const lenteAtual = visiveis.find(l => l.id === v.lente) ?? visiveis[0]
  const subs = SUBS[v.lente]

  const acoes = {
    aoAbrir: (p: string) => void v.abrir(p),
    aoAdicionar: (tipo: string, inicial?: Record<string, unknown>) => setCriando({ tipo, inicial }),
    aoEditar: (n: NoteComCampos) => setAlterando(n),
    aoExcluir: (n: NoteComCampos) => setExcluindo(n),
    aoLancar: (item: string, dia?: string) => setLancando({ item, dia: dia ?? hoje }),
    aoAlterar: (path: string, campos: Record<string, unknown>) => void v.alterar(path, campos),
    aoMarcarDia: (dia: string, campos: Record<string, unknown>) => void v.marcarNoDia(dia, campos),
    aoModal: (id: string, ctx?: Record<string, unknown>) => setModal({ id, ctx })
  }

  function view(): ReactElement {
    const comuns = { notas: v.notas, sub: v.sub, hoje, ...acoes }
    switch (v.lente) {
      case 'hoje':         return <LenteHoje {...comuns} />
      case 'vida':         return <LenteVida {...comuns} />
      case 'saude':        return <LenteSaude {...comuns} />
      case 'conhecimento': return <LenteEstudos {...comuns} />
      case 'financas':     return <LenteGrana {...comuns} />
      case 'calendario':
        return (
          <Calendario
            notas={v.notas} hoje={hoje}
            aoAbrir={acoes.aoAbrir} aoAdicionar={acoes.aoAdicionar} aoExcluir={acoes.aoExcluir}
          />
        )
      case 'dev':
        return (
          <LenteDev
            {...comuns}
            pastas={v.pastas}
            pastasDev={v.config.pastasDev}
            aoAutorizar={() => void v.autorizarPasta()}
            aoRemoverPastaDev={raiz => void v.removerPasta(raiz)}
            arvore={v.arvoreDev}
            lerArquivo={v.lerArquivo}
            gravarArquivo={v.gravarArquivo}
            aoTerminal={(raiz, sub) => void v.abrirTerminal(raiz, sub)}
            aoRevelar={(raiz, sub) => void v.revelar(raiz, sub)}
            aoCriarPasta={p => void v.criarPasta(p)}
            aoMoverNota={(de, para) => void v.mover(de, para)}
            aoSoltarPastas={arquivos => void v.autorizarArrastadas(arquivos)}
          />
        )
      default: return <></>
    }
  }

  const formDe = (n: NoteComCampos) => FORMULARIOS[n.tipo]

  return (
    <>
      <div className={subs ? 'shell com-subnav' : 'shell so-lente'}>
        <nav className="rail">
          {visiveis.map(({ id, nome, Icone }) => (
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
          <button
            className="rail-item rail-rodape"
            title="Escolher quais áreas aparecem"
            onClick={() => setAjustandoAreas(true)}
          >
            <IconeAreas />
            <span>Áreas</span>
          </button>
        </nav>

        {subs && (
          <aside className="subnav">
            <div className="lente-nome">{lenteAtual?.nome}</div>
            {subs.map(s => (
              <button
                key={s.id}
                className="subnav-item"
                aria-current={v.sub === s.id}
                onClick={() => { v.setSub(s.id); v.fechar() }}
              >
                {s.nome}
              </button>
            ))}
          </aside>
        )}

        <main className="main">
          <div className="topo">
            <span className="caminho">{lenteAtual?.nome}</span>
            <div className="topo-dir">
              <button className="btn-fantasma" onClick={() => setPaleta(true)}>
                Buscar <kbd>Ctrl K</kbd>
              </button>
            </div>
          </div>

          {v.erro && (
            <div className="erro" onClick={v.limparErro} title="Clique para dispensar">{v.erro}</div>
          )}

          {v.aberta ? (
            <NotaPainel
              nota={v.notaAberta}
              caminho={v.aberta}
              conteudo={v.conteudo}
              editando={v.editando}
              sujo={v.sujo}
              saindo={v.saindo}
              entrando={v.entrando}
              voltarPara={lenteAtual?.nome ?? 'voltar'}
              aoVoltar={v.fechar}
              aoEditar={v.setEditando}
              aoMudar={v.setConteudo}
              aoSalvar={() => void v.salvar()}
              aoAbrirNome={alvo => void v.abrirPorNome(alvo)}
              aoAbrirPath={p => void v.abrir(p)}
              aoExcluir={v.notaAberta ? () => setExcluindo(v.notaAberta) : undefined}
            />
          ) : view()}
        </main>
      </div>

      {paleta && (
        <Paleta
          notas={v.notas}
          aoEscolher={p => void v.abrir(p)}
          aoIrParaLente={id => v.setLente(id as Lente)}
          aoCriar={titulo => setCriando({ tipo: 'anotacao', inicial: { titulo } })}
          aoFechar={() => setPaleta(false)}
        />
      )}

      {criando && FORMULARIOS[criando.tipo] && (
        <ModalFormulario
          nome={FORMULARIOS[criando.tipo].nome}
          campos={FORMULARIOS[criando.tipo].campos}
          hoje={hoje}
          inicial={criando.inicial}
          aoFechar={() => setCriando(null)}
          aoSalvar={async campos => {
            // `pasta` é destino, não conteúdo: vem do navegador do Dev para
            // dizer ONDE criar, e não pode acabar escrita no frontmatter.
            const juntos = { ...criando.inicial, ...campos } as Record<string, unknown>
            const pasta = juntos.pasta
            delete juntos.pasta
            await v.criar(criando.tipo, juntos, typeof pasta === 'string' ? pasta : undefined)
            setCriando(null)
          }}
        />
      )}

      {alterando && formDe(alterando) && (
        <ModalFormulario
          nome={`Editar ${formDe(alterando).nome.toLowerCase()}`}
          campos={formDe(alterando).campos}
          hoje={hoje}
          inicial={{ ...alterando.campos, titulo: alterando.title }}
          acao="Salvar alterações"
          aoFechar={() => setAlterando(null)}
          aoSalvar={async campos => {
            await v.alterar(alterando.path, campos)
            setAlterando(null)
          }}
        />
      )}

      {alterando && !formDe(alterando) && (
        <Confirmar
          titulo="Sem formulário para este tipo"
          texto={`"${alterando.tipo}" não tem formulário. Abra a nota para editar o texto direto.`}
          rotulo="Abrir a nota"
          aoConfirmar={() => { void v.abrir(alterando.path); setAlterando(null) }}
          aoFechar={() => setAlterando(null)}
        />
      )}

      {lancando && ITENS[lancando.item] && (
        <ModalFormulario
          nome={`${ITENS[lancando.item].nome} · ${lancando.dia}`}
          campos={ITENS[lancando.item].campos}
          hoje={hoje}
          aoFechar={() => setLancando(null)}
          aoSalvar={async item => {
            await v.lancar(lancando.dia, ITENS[lancando.item].campo, item)
            setLancando(null)
          }}
        />
      )}

      {modal?.id === 'registro-treino' && (
        <RegistroTreino
          modelos={v.notas.filter(n => n.tipo === 'treino-modelo')}
          sessoes={v.notas.filter(n => n.tipo === 'sessao')}
          modeloInicial={typeof modal.ctx?.modelo === 'string' ? modal.ctx.modelo : undefined}
          hoje={hoje}
          aoFechar={() => setModal(null)}
          aoSalvar={async campos => {
            await v.criar('sessao', campos)
            setModal(null)
          }}
        />
      )}

      {ajustandoAreas && (
        <ModalAreas
          areasAtuais={v.config.areas}
          aoSalvar={areas => void v.salvarAreas(areas)}
          aoFechar={() => setAjustandoAreas(false)}
        />
      )}

      {excluindo && (
        <Confirmar
          titulo="Excluir esta nota?"
          texto={`"${excluindo.title}" será apagada do disco. O arquivo ${excluindo.path} some de vez — isto não tem desfazer.`}
          rotulo="Excluir"
          perigo
          aoConfirmar={() => { void v.excluir(excluindo.path); setExcluindo(null) }}
          aoFechar={() => setExcluindo(null)}
        />
      )}
    </>
  )
}

/**
 * Confirmação para ação sem volta.
 *
 * Apagar um `.md` é irreversível — não existe lixeira no vault. Um clique
 * errado no × de uma linha não pode custar uma nota.
 */
function Confirmar({ titulo, texto, rotulo, perigo, aoConfirmar, aoFechar }: {
  titulo: string
  texto: string
  rotulo: string
  perigo?: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form estreito" onClick={e => e.stopPropagation()}>
        <div className="form-topo">{titulo}</div>
        <div className="form-corpo"><p className="confirmar-texto">{texto}</p></div>
        <div className="form-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className={perigo ? 'btn perigo' : 'btn'} onClick={aoConfirmar}>{rotulo}</button>
        </div>
      </div>
    </div>
  )
}
