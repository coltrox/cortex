import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { PainelRodar } from './PainelRodar'
import { EditorCodigo } from './EditorCodigo'
import { NovoProjeto } from './NovoProjeto'
import { projetoDoFoco, type Foco } from './projetoAtual'
import type { EntradaDev } from '../useVault'
import type { LinguagemProjeto, ModeloProjeto } from '../../shared/types'
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
  /** Cria um projeto em Área de Trabalho\projetos; `null` se não deu. */
  aoNovoProjeto: (
    modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string
  ) => Promise<{ raiz: string; pasta: string } | null>
  /** Clona um repositório do GitHub em Área de Trabalho\projetos. */
  aoClonarRepo: (url: string) => Promise<{ raiz: string; pasta: string } | null>
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

/* ---------- clonar do GitHub ---------- */

/** Aceita o link da página, o de clone, o SSH ou só `dono/repositório`. */
const PARECE_REPO =
  /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/|git@github\.com:)?[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}?(?:\.git)?\/?$/

function ClonarRepo({ aoClonar, aoFechar }: {
  aoClonar: (url: string) => Promise<boolean>
  aoFechar: () => void
}) {
  const [url, setUrl] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valido = PARECE_REPO.test(url.trim())
  const nome = valido ? url.trim().replace(/\/$/, '').replace(/\.git$/, '').split(/[/:]/).pop() : ''

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  const clonar = async (): Promise<void> => {
    if (!valido || enviando) return
    setEnviando(true)
    try {
      if (await aoClonar(url.trim())) aoFechar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="novo-projeto" role="dialog" aria-label="Clonar do GitHub" onClick={e => e.stopPropagation()}>
        <div className="novo-projeto-topo">
          <strong>Clonar do GitHub</strong>
          <button className="btn-icone" title="Fechar" onClick={aoFechar}>×</button>
        </div>
        <span className="form-rotulo">Repositório</span>
        <input
          className="busca"
          autoFocus
          value={url}
          placeholder="https://github.com/dono/repositorio"
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void clonar() }}
        />
        <p className="form-dica">
          {valido
            ? `Vai para Área de Trabalho\\projetos\\${nome}. Repositório privado usa o login do Git deste computador.`
            : 'Cole o link do repositório, ou escreva dono/repositório.'}
        </p>
        <div className="novo-projeto-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className="btn" onClick={() => void clonar()} disabled={!valido || enviando}>
            {enviando ? 'Clonando…' : 'Clonar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- metade do disco ---------- */

/** A extensão, para o arquivo ganhar a cor do tipo na árvore (como no VS Code). */
const extensao = (nome: string): string => {
  const i = nome.lastIndexOf('.')
  return i > 0 ? nome.slice(i + 1).toLowerCase() : ''
}

function Codigo({
  pastasDev, aoAutorizar, aoRemoverPastaDev, arvore, lerArquivo, gravarArquivo,
  aoTerminal, aoRevelar, aoSoltarPastas, aoNovoProjeto, aoClonarRepo
}: PropsDev) {
  const [sobrevoando, setSobrevoando] = useState(false)
  const [raiz, setRaiz] = useState<string | null>(pastasDev[0] ?? null)
  /**
   * O conteúdo de cada pasta já lida, pela pasta ('' é a raiz).
   *
   * A árvore abre para baixo, como no VS Code: entrar numa pasta não troca a
   * tela, só mostra o que tem dentro logo abaixo dela. Cada pasta é lida só
   * quando abre pela primeira vez.
   */
  const [filhos, setFilhos] = useState<Record<string, EntradaDev[]>>({})
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set())
  /** O último item clicado: é dele que sai o projeto dos scripts. */
  const [foco, setFoco] = useState<Foco>(null)
  /**
   * Mais espaço para o código: o editor em tela cheia (Esc volta) e a árvore
   * escondida. Pedido do dono — o painel ao lado da árvore ficava apertado.
   */
  const [amplo, setAmplo] = useState(false)
  const [semArvore, setSemArvore] = useState(false)
  /** Pasta para trazer à vista na árvore quando ela aparecer (o projeto recém-criado). */
  const rolarPara = useRef<string | null>(null)

  const [arquivo, setArquivo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [gravado, setGravado] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [criandoProjeto, setCriandoProjeto] = useState(false)
  const [clonando, setClonando] = useState(false)
  /**
   * A pasta `projetos` de um projeto recém-criado, esperando a lista de
   * pastas autorizadas chegar com ela. Selecionar antes faria o efeito abaixo
   * achar a raiz "não autorizada" e trocar para a primeira da lista.
   */
  const [querRaiz, setQuerRaiz] = useState<{ raiz: string; pasta: string } | null>(null)

  const trocarRaiz = (r: string | null): void => {
    setRaiz(r)
    setFilhos({})
    setAbertas(new Set())
    setFoco(null)
    setArquivo(null)
  }

  /**
   * Depois de criar ou clonar, a árvore já abre o projeto novo — e não só a
   * pasta `projetos` fechada. Pedido do dono. Se a pasta ainda não existe
   * (a instalação está começando), ela é lida de novo quando o processo acaba.
   */
  const abrirProjetoNovo = (r: string, pasta: string): void => {
    setAbertas(new Set([pasta]))
    setFoco({ rel: pasta, pasta: true })
    rolarPara.current = pasta
    void lerPasta(r, '')
    void lerPasta(r, pasta)
  }

  // Uma pasta autorizada agora, ou a última removida, muda quem deve estar
  // selecionado — sem isto a tela ficaria apontando para uma raiz que saiu.
  useEffect(() => {
    if (querRaiz) {
      if (!pastasDev.includes(querRaiz.raiz)) return
      trocarRaiz(querRaiz.raiz)
      abrirProjetoNovo(querRaiz.raiz, querRaiz.pasta)
      setQuerRaiz(null)
      return
    }
    if (raiz && pastasDev.includes(raiz)) return
    trocarRaiz(pastasDev[0] ?? null)
  }, [pastasDev, raiz, querRaiz])

  const lerPasta = useCallback(async (r: string, sub: string) => {
    try {
      const itens = await arvore(r, sub)
      setFilhos(f => ({ ...f, [sub]: itens }))
    } catch {
      setFilhos(f => ({ ...f, [sub]: [] }))
    }
  }, [arvore])

  useEffect(() => {
    if (raiz) void lerPasta(raiz, '')
  }, [raiz, lerPasta])

  // O projeto recém-criado vem para a vista assim que a linha dele existe.
  useEffect(() => {
    const alvo = rolarPara.current
    if (!alvo) return
    const el = document.querySelector(`.dev-item[data-rel="${CSS.escape(alvo)}"]`)
    if (el) { el.scrollIntoView({ block: 'nearest' }); rolarPara.current = null }
  }, [filhos])

  useEffect(() => {
    if (!amplo) return
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape') setAmplo(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [amplo])

  // Um processo que termina (a criação de um projeto, um build) muda o que há
  // na pasta: a raiz e as pastas abertas são lidas de novo.
  const recarregar = useCallback(() => {
    if (!raiz) return
    void lerPasta(raiz, '')
    for (const p of abertas) void lerPasta(raiz, p)
  }, [raiz, abertas, lerPasta])

  const alternarPasta = (rel: string): void => {
    if (!raiz) return
    setFoco({ rel, pasta: true })
    const nova = new Set(abertas)
    if (nova.has(rel)) {
      // Fechar uma pasta fecha as de dentro também, como no VS Code.
      for (const p of nova) if (p === rel || p.startsWith(rel + '/')) nova.delete(p)
    } else {
      nova.add(rel)
      if (!filhos[rel]) void lerPasta(raiz, rel)
    }
    setAbertas(nova)
  }

  const criarProjeto = async (
    modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string
  ): Promise<boolean> => {
    const r = await aoNovoProjeto(modelo, linguagem, nome)
    if (!r) return false
    setQuerRaiz({ raiz: r.raiz, pasta: r.pasta })
    return true
  }

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
  const projeto = projetoDoFoco(foco, filhos)
  const nomeRaiz = raiz ? raiz.split(/[\\/]/).filter(Boolean).pop() ?? raiz : ''

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

  const clonarRepo = async (url: string): Promise<boolean> => {
    const r = await aoClonarRepo(url)
    if (!r) return false
    setQuerRaiz({ raiz: r.raiz, pasta: r.pasta })
    return true
  }

  const janelaNovoProjeto = (
    <>
      {criandoProjeto && <NovoProjeto aoCriar={criarProjeto} aoFechar={() => setCriandoProjeto(false)} />}
      {clonando && <ClonarRepo aoClonar={clonarRepo} aoFechar={() => setClonando(false)} />}
    </>
  )

  /** As linhas de uma pasta aberta, e dentro delas as das subpastas abertas. */
  const linhas = (sub: string, nivel: number): ReactNode[] => {
    const itens = filhos[sub]
    const recuo = { paddingLeft: 8 + nivel * 14 }
    if (!itens) return [<div key={`${sub}/…`} className="dev-item-vazio" style={recuo}>Lendo…</div>]
    if (itens.length === 0) return [<div key={`${sub}/∅`} className="dev-item-vazio" style={recuo}>Pasta vazia</div>]
    return itens.flatMap(it => {
      const aberta = it.pasta && abertas.has(it.rel)
      const linha = (
        <button
          key={it.rel}
          className="dev-item"
          style={recuo}
          aria-current={arquivo === it.rel}
          aria-expanded={it.pasta ? aberta : undefined}
          data-pasta={it.pasta}
          data-inerte={!it.pasta && !it.editavel}
          data-ext={it.pasta ? undefined : extensao(it.nome)}
          data-rel={it.rel}
          title={it.pasta ? it.rel : `${it.rel} · ${Math.max(1, Math.round(it.tamanho / 1024))} kB`}
          onClick={() => {
            if (it.pasta) alternarPasta(it.rel)
            else if (it.editavel) { setFoco({ rel: it.rel, pasta: false }); void abrirArquivo(it.rel) }
          }}
        >
          <span className="dev-seta" aria-hidden="true">{it.pasta ? '›' : ''}</span>
          <span className="dev-icone" aria-hidden="true" />
          <span className="dev-nome">{it.nome}</span>
          {!it.pasta && !it.editavel && <span className="dev-tag">binário</span>}
        </button>
      )
      return aberta ? [linha, ...linhas(it.rel, nivel + 1)] : [linha]
    })
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
          <div className="dev-vazio-botoes">
            <button className="btn grande" onClick={() => setCriandoProjeto(true)}>Novo projeto</button>
            <button className="btn-fantasma" onClick={() => setClonando(true)}>Clonar do GitHub</button>
            <button className="btn-fantasma" onClick={aoAutorizar}>Escolher uma pasta</button>
          </div>
        </div>
        {janelaNovoProjeto}
      </div>
    )
  }

  return (
    <div {...zona} data-soltar={sobrevoando}>
      <Secao
        nome="Pastas de código"
        direita={
          <span className="dev-secao-botoes">
            <button className="btn-fantasma pequeno" onClick={() => setCriandoProjeto(true)}>+ Novo projeto</button>
            <button className="btn-fantasma pequeno" onClick={() => setClonando(true)}>Clonar do GitHub</button>
            <button className="btn-fantasma pequeno" onClick={aoAutorizar}>Autorizar pasta</button>
          </span>
        }
      />

      <div className="chips dev-raizes">
        {pastasDev.map(p => (
          <span key={p} className="chip-raiz" aria-pressed={raiz === p} title={p}>
            <button onClick={() => { if (raiz !== p) trocarRaiz(p) }}>
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
          {/*
            Os scripts rodam SEMPRE na raiz do projeto em que se está, qualquer
            que seja o arquivo aberto: é onde está o package.json. Pedido do
            dono — antes entrar numa subpasta sumia com o npm run dev.
          */}
          <PainelRodar
            raiz={raiz}
            sub={projeto}
            titulo={projeto ? projeto.split('/').pop() : nomeRaiz}
            aoTerminar={recarregar}
            extras={
              <>
                <button className="btn-fantasma pequeno" onClick={() => aoTerminal(raiz, projeto)}>Terminal</button>
                <button className="btn-fantasma pequeno" onClick={() => aoRevelar(raiz, projeto)}>Explorer</button>
              </>
            }
          />

          <div className="dev-corpo" data-amplo={amplo} data-sem-arvore={semArvore && !!arquivo}>
            <div className="dev-arvore" role="tree" aria-label={`Arquivos de ${nomeRaiz}`}>
              <div className="dev-arvore-topo">
                <span className="dev-arvore-nome" title={raiz}>{nomeRaiz}</span>
                <span className="dev-arvore-botoes">
                  <button className="btn-icone" title="Recolher pastas" disabled={abertas.size === 0}
                    onClick={() => setAbertas(new Set())}>⊟</button>
                  <button className="btn-icone" title="Ler de novo" onClick={recarregar}>↻</button>
                  {arquivo && (
                    <button className="btn-icone" title="Esconder a árvore" onClick={() => setSemArvore(true)}>⇤</button>
                  )}
                </span>
              </div>
              {linhas('', 0)}
            </div>

            <div className="dev-editor">
              {!arquivo ? (
                <Vazio>Abra uma pasta na árvore e escolha um arquivo para editar.</Vazio>
              ) : (
                <>
                  <div className="dev-editor-topo">
                    <span className="dev-editor-trilha" title={arquivo}>
                      {arquivo.split('/').map((seg, i, todos) => (
                        <span key={i} data-ultimo={i === todos.length - 1}>{seg}</span>
                      ))}
                    </span>
                    <span className="nota-trilha-dir">
                      {sujo && <span className="salvo" data-sujo>não salvo</span>}
                      {semArvore && (
                        <button className="btn-fantasma pequeno" title="Mostrar a árvore" onClick={() => setSemArvore(false)}>
                          ⇥ Arquivos
                        </button>
                      )}
                      <button
                        className="btn-fantasma pequeno"
                        title={amplo ? 'Voltar ao tamanho normal (Esc)' : 'Ampliar o código na tela toda'}
                        onClick={() => setAmplo(a => !a)}
                      >
                        {amplo ? '⤡ Reduzir' : '⤢ Ampliar'}
                      </button>
                      <button className="btn pequeno" onClick={() => void salvar()} disabled={!sujo || salvando}>
                        {salvando ? 'Salvando…' : 'Salvar'}
                      </button>
                    </span>
                  </div>
                  <EditorCodigo
                    valor={texto}
                    ext={extensao(arquivo)}
                    aoMudar={setTexto}
                    aoSalvar={() => void salvar()}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}

      {janelaNovoProjeto}
    </div>
  )
}
