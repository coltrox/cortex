import { useCallback, useEffect, useState, type DragEvent } from 'react'
import type { EntradaDev } from '../useVault'
import { Secao, Titulo, Linha, Vazio, txt, type PropsLente } from './base'

/**
 * Dev.
 *
 * Duas metades que nunca se misturam:
 *
 * - **Projetos e Segurança** navegam o VAULT. São notas markdown em pastas de
 *   verdade, criadas e movidas por arrastar. Confinamento do vault.
 *
 * - **Código** navega PASTAS DO DISCO que você autorizou uma a uma pelo
 *   diálogo nativo. Confinamento separado, lista de autorização explícita.
 *
 * A tentação era usar um caminho só e afrouxar o guarda para caber os dois.
 * São dois guardas.
 */

type PropsDev = PropsLente & {
  /** Todas as pastas do vault, para navegar e para o destino do arrastar. */
  pastas: string[]
  pastasDev: string[]
  aoAutorizar: () => void
  aoRemoverPastaDev: (raiz: string) => void
  arvore: (raiz: string, sub: string) => Promise<EntradaDev[]>
  lerArquivo: (raiz: string, arquivo: string) => Promise<string | null>
  gravarArquivo: (raiz: string, arquivo: string, conteudo: string) => Promise<boolean>
  aoTerminal: (raiz: string, sub?: string) => void
  aoRevelar: (raiz: string, sub?: string) => void
  aoCriarPasta: (pasta: string) => void
  aoMoverNota: (de: string, paraPasta: string) => void
  aoSoltarPastas: (arquivos: FileList) => void
}

const nomeBase = (p: string): string => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '')
const paiDe = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

export function LenteDev(p: PropsDev) {
  const raizVault = p.sub === 'seguranca' ? 'Dev/Seguranca' : 'Dev/Projetos'

  return (
    <div className="lente">
      <Titulo nome="Dev" />
      {p.sub === 'codigo'
        ? <Codigo {...p} />
        : <NavegadorVault {...p} raiz={raizVault} />}
    </div>
  )
}

/* ---------- metade do vault ---------- */

function NavegadorVault({
  notas, pastas, raiz, aoAbrir, aoAdicionar, aoExcluir, aoCriarPasta, aoMoverNota
}: PropsDev & { raiz: string }) {
  const [atual, setAtual] = useState(raiz)
  const [novaPasta, setNovaPasta] = useState('')
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)

  // Trocar de aba (Projetos ↔ Segurança) volta para a raiz daquela aba.
  useEffect(() => { setAtual(raiz) }, [raiz])

  const subpastas = pastas
    .filter(pa => paiDe(pa) === atual)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const aqui = notas
    .filter(n => paiDe(n.path) === atual)
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))

  const trilha = atual.split('/')
  const foraDaRaiz = atual !== raiz

  const criar = (): void => {
    const nome = novaPasta.trim()
    if (!nome) return
    aoCriarPasta(`${atual}/${nome}`)
    setNovaPasta('')
    setCriandoPasta(false)
  }

  const soltar = (destino: string) => (e: DragEvent): void => {
    e.preventDefault()
    if (arrastando) aoMoverNota(arrastando, destino)
    setArrastando(null)
    setAlvo(null)
  }

  return (
    <>
      <Secao
        nome="Notas"
        acao="Nota"
        aoClicar={() => aoAdicionar('nota', { pasta: atual })}
        direita={
          <button className="btn-fantasma" onClick={() => setCriandoPasta(c => !c)}>
            + Pasta
          </button>
        }
      />

      {criandoPasta && (
        <div className="nova-pasta">
          <input
            autoFocus
            placeholder="Nome da pasta"
            value={novaPasta}
            onChange={e => setNovaPasta(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') criar()
              if (e.key === 'Escape') { setCriandoPasta(false); setNovaPasta('') }
            }}
          />
          <button className="btn" onClick={criar} disabled={!novaPasta.trim()}>Criar</button>
          <button className="btn-fantasma" onClick={() => { setCriandoPasta(false); setNovaPasta('') }}>
            Cancelar
          </button>
        </div>
      )}

      <div className="trilha">
        {trilha.map((seg, i) => {
          const caminho = trilha.slice(0, i + 1).join('/')
          const dentroDaRaiz = caminho.startsWith(raiz.split('/')[0])
          return (
            <button
              key={caminho}
              className="trilha-seg"
              disabled={!dentroDaRaiz || caminho === atual}
              data-alvo={alvo === caminho}
              onClick={() => dentroDaRaiz && setAtual(caminho)}
              onDragOver={e => { if (arrastando) { e.preventDefault(); setAlvo(caminho) } }}
              onDragLeave={() => setAlvo(a => (a === caminho ? null : a))}
              onDrop={soltar(caminho)}
            >
              {seg}
            </button>
          )
        })}
      </div>

      {(subpastas.length > 0 || foraDaRaiz) && (
        <div className="pastas-grade">
          {foraDaRaiz && (
            <button className="pasta-card" onClick={() => setAtual(paiDe(atual))}>
              <span className="pasta-icone">↰</span>
              <span>voltar</span>
            </button>
          )}
          {subpastas.map(pa => (
            <button
              key={pa}
              className="pasta-card"
              data-alvo={alvo === pa}
              onClick={() => setAtual(pa)}
              onDragOver={e => { if (arrastando) { e.preventDefault(); setAlvo(pa) } }}
              onDragLeave={() => setAlvo(a => (a === pa ? null : a))}
              onDrop={soltar(pa)}
            >
              <span className="pasta-icone">▤</span>
              <span>{nomeBase(pa)}</span>
              <span className="pasta-conta">
                {notas.filter(n => n.path.startsWith(`${pa}/`)).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {aqui.length === 0 ? (
        <Vazio>
          Pasta vazia. Crie uma nota aqui, ou arraste uma de outra pasta para dentro.
        </Vazio>
      ) : (
        <div className="lista-notas">
          {aqui.map(n => (
            <div
              key={n.path}
              draggable
              onDragStart={() => setArrastando(n.path)}
              onDragEnd={() => { setArrastando(null); setAlvo(null) }}
              data-arrastando={arrastando === n.path}
            >
              <Linha aoAbrir={() => aoAbrir(n.path)} aoExcluir={() => aoExcluir(n)}
                titulo="Arraste para outra pasta para mover">
                <span className="grip">⋮⋮</span>
                <span className="linha-titulo">{n.title}</span>
                {txt(n.campos.project) && <span className="tipo">{txt(n.campos.project)}</span>}
                <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
              </Linha>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- metade do disco ---------- */

function Codigo({
  pastasDev, aoAutorizar, aoRemoverPastaDev, arvore, lerArquivo, gravarArquivo,
  aoTerminal, aoRevelar, aoSoltarPastas
}: PropsDev) {
  const [sobrevoando, setSobrevoando] = useState(false)
  const [raiz, setRaiz] = useState<string | null>(pastasDev[0] ?? null)
  const [pastaAtual, setPastaAtual] = useState('')
  const [itens, setItens] = useState<EntradaDev[]>([])
  const [carregando, setCarregando] = useState(false)

  const [arquivo, setArquivo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [gravado, setGravado] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Uma pasta autorizada agora, ou a última removida, muda quem deve estar
  // selecionado — sem isto a tela ficaria apontando para uma raiz que saiu.
  useEffect(() => {
    if (raiz && pastasDev.includes(raiz)) return
    setRaiz(pastasDev[0] ?? null)
    setPastaAtual('')
    setArquivo(null)
  }, [pastasDev, raiz])

  const carregar = useCallback(async (r: string, sub: string) => {
    setCarregando(true)
    try { setItens(await arvore(r, sub)) } finally { setCarregando(false) }
  }, [arvore])

  useEffect(() => {
    if (raiz) void carregar(raiz, pastaAtual)
    else setItens([])
  }, [raiz, pastaAtual, carregar])

  const abrirArquivo = async (rel: string): Promise<void> => {
    if (!raiz) return
    const c = await lerArquivo(raiz, rel)
    if (c === null) return
    setArquivo(rel)
    setTexto(c)
    setGravado(c)
  }

  const salvar = async (): Promise<void> => {
    if (!raiz || !arquivo) return
    setSalvando(true)
    try {
      if (await gravarArquivo(raiz, arquivo, texto)) setGravado(texto)
    } finally { setSalvando(false) }
  }

  const sujo = texto !== gravado
  const trilha = pastaAtual ? pastaAtual.split('/') : []

  // Arrastar do explorador de arquivos é o atalho para o mesmo diálogo: o
  // caminho vai para o processo principal, que confirma antes de autorizar.
  const zona = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setSobrevoando(true) },
    onDragLeave: () => setSobrevoando(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setSobrevoando(false)
      if (e.dataTransfer?.files?.length) aoSoltarPastas(e.dataTransfer.files)
    }
  }

  if (pastasDev.length === 0) {
    return (
      <div {...zona} data-soltar={sobrevoando}>
        <Secao nome="Pastas de código" />
        <div className="vazio-grande zona-soltar" data-ativa={sobrevoando}>
          <p>Nenhuma pasta autorizada ainda.</p>
          <p className="lente-sub">
            Arraste a pasta do projeto para cá, ou escolha pelo botão. O Cortex só
            enxerga as pastas que você autorizar, uma a uma — nada fora delas é
            lido ou gravado, nem o resto do disco, nem o próprio vault.
          </p>
          <button className="btn grande" onClick={aoAutorizar}>Escolher uma pasta</button>
        </div>
      </div>
    )
  }

  return (
    <div {...zona} data-soltar={sobrevoando}>
      <Secao
        nome="Pastas de código"
        direita={<button className="btn-fantasma" onClick={aoAutorizar}>+ Autorizar pasta</button>}
      />

      <div className="chips">
        {pastasDev.map(p => (
          <span key={p} className="chip-raiz" aria-pressed={raiz === p} title={p}>
            <button onClick={() => { setRaiz(p); setPastaAtual(''); setArquivo(null) }}>
              {p.split(/[\\/]/).filter(Boolean).pop()}
            </button>
            <button
              className="btn-icone perigo"
              title="Tirar a autorização (não apaga nada do disco)"
              onClick={() => aoRemoverPastaDev(p)}
            >×</button>
          </span>
        ))}
      </div>

      {raiz && (
        <>
          <div className="dev-barra">
            <div className="trilha">
              <button className="trilha-seg" disabled={pastaAtual === ''}
                onClick={() => { setPastaAtual(''); setArquivo(null) }}>
                {raiz.split(/[\\/]/).filter(Boolean).pop()}
              </button>
              {trilha.map((seg, i) => {
                const caminho = trilha.slice(0, i + 1).join('/')
                return (
                  <button key={caminho} className="trilha-seg" disabled={caminho === pastaAtual}
                    onClick={() => { setPastaAtual(caminho); setArquivo(null) }}>
                    {seg}
                  </button>
                )
              })}
            </div>
            <div className="dev-acoes">
              <button className="btn" onClick={() => aoTerminal(raiz, pastaAtual)}>
                Abrir terminal aqui
              </button>
              <button className="btn-fantasma" onClick={() => aoRevelar(raiz, pastaAtual)}>
                Abrir no Explorer
              </button>
            </div>
          </div>

          <div className="dev-corpo">
            <div className="dev-arvore">
              {carregando && <div className="vazio">Lendo…</div>}
              {!carregando && itens.length === 0 && <div className="vazio">Pasta vazia.</div>}
              {itens.map(it => (
                <button
                  key={it.rel}
                  className="dev-item"
                  aria-current={arquivo === it.rel}
                  data-pasta={it.pasta}
                  data-inerte={!it.pasta && !it.editavel}
                  title={it.pasta ? it.rel : `${it.rel} · ${Math.max(1, Math.round(it.tamanho / 1024))} kB`}
                  onClick={() => {
                    if (it.pasta) { setPastaAtual(it.rel); setArquivo(null) }
                    else if (it.editavel) void abrirArquivo(it.rel)
                  }}
                >
                  <span className="dev-icone">{it.pasta ? '▸' : '·'}</span>
                  <span className="dev-nome">{it.nome}</span>
                  {!it.pasta && !it.editavel && <span className="dev-tag">binário</span>}
                </button>
              ))}
            </div>

            <div className="dev-editor">
              {!arquivo ? (
                <Vazio>Escolha um arquivo de texto à esquerda para editar.</Vazio>
              ) : (
                <>
                  <div className="dev-editor-topo">
                    <span className="nota-caminho">{arquivo}</span>
                    <span className="nota-trilha-dir">
                      {sujo && <span className="salvo" data-sujo>não salvo</span>}
                      <button className="btn" onClick={() => void salvar()} disabled={!sujo || salvando}>
                        {salvando ? 'Salvando…' : 'Salvar'}
                      </button>
                    </span>
                  </div>
                  <textarea
                    className="editor codigo"
                    value={texto}
                    spellCheck={false}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => {
                      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                        e.preventDefault()
                        void salvar()
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
