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

/** O tipo que marca um item da própria árvore sendo arrastado (mover, e não copiar). */
const TIPO_ITEM = 'application/x-cortex-dev-item'
/** Abrem numa visualização em vez do editor. Mesma lista de `tipoDeMidia`, no processo principal. */
const EXT_MIDIA = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'pdf'])

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
  /**
   * A pasta sobre a qual um arquivo do Explorer está sendo arrastado ('' é a
   * raiz). É ela que abre a tampa e balança — pedido do dono, para ficar
   * claro onde o arquivo vai cair.
   */
  const [soltarEm, setSoltarEm] = useState<string | null>(null)
  /** O que acabou de ser copiado para a árvore, para piscar ao chegar. */
  const [chegaram, setChegaram] = useState<Set<string>>(() => new Set())
  const [avisoArvore, setAvisoArvore] = useState<string | null>(null)
  /** O item da árvore sendo arrastado para outra pasta (mover). */
  const arrastado = useRef<string | null>(null)
  /** Foto, PDF ou outro arquivo que não é texto, aberto no lugar do editor. */
  const [visor, setVisor] = useState<{ rel: string; tipo: string; url: string; tamanho: number } | null>(null)
  /** O menu do botão direito (ou do ⋯) de um item. */
  const [menu, setMenu] = useState<{ x: number; y: number; it: EntradaDev } | null>(null)
  /** O item com o nome virando campo de texto (F2). */
  const [renomeando, setRenomeando] = useState<string | null>(null)

  // O endereço da foto/PDF ocupa memória até ser devolvido.
  // Pela URL, e não pelo objeto: renomear troca o objeto mas mantém a mesma foto.
  const urlVisor = visor?.url
  useEffect(() => () => { if (urlVisor) URL.revokeObjectURL(urlVisor) }, [urlVisor])

  useEffect(() => {
    if (!menu) return
    const fechar = (): void => setMenu(null)
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('keydown', k)
    window.addEventListener('resize', fechar)
    window.addEventListener('wheel', fechar, { passive: true })
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('resize', fechar)
      window.removeEventListener('wheel', fechar)
    }
  }, [menu])

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

  // Parar com o arquivo na mão sobre uma pasta fechada abre a pasta, como no VS Code.
  useEffect(() => {
    if (!soltarEm || abertas.has(soltarEm) || !raiz) return
    const t = setTimeout(() => {
      setAbertas(a => new Set(a).add(soltarEm))
      if (!filhos[soltarEm]) void lerPasta(raiz, soltarEm)
    }, 700)
    return () => clearTimeout(t)
  }, [soltarEm, abertas, raiz, filhos, lerPasta])

  /**
   * Copia para `dest` o que veio do Explorer. O processo principal nunca
   * sobrescreve — um nome repetido vira "nome (2)" —, então soltar não
   * destrói nada. A pasta de destino abre e a cópia pisca ao chegar.
   */
  const copiarSoltos = async (dest: string, arquivos: FileList): Promise<void> => {
    if (!raiz) return
    setAvisoArvore(null)
    const novos: string[] = []
    for (const f of Array.from(arquivos)) {
      const origem = window.vaultApi.caminhoArrastado(f)
      if (!origem) continue
      try {
        novos.push((await window.vaultApi.copiarParaPasta(raiz, dest, origem)).rel)
      } catch (e) {
        const motivo = e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : 'não deu para copiar'
        setAvisoArvore(`${f.name}: ${motivo}`)
      }
    }
    if (dest) setAbertas(a => new Set(a).add(dest))
    await lerPasta(raiz, dest)
    if (novos.length > 0) {
      rolarPara.current = novos[0]
      setChegaram(new Set(novos))
      setTimeout(() => setChegaram(new Set()), 1600)
    }
  }

  /**
   * Um arrastar que a árvore aceita: arquivo do Explorer (copia) ou um item
   * da própria árvore (move). O item arrastado fica em `arrastado`, porque
   * durante o arrastar o navegador não deixa ler o que vai no `dataTransfer`.
   */
  const ehArrasto = (e: DragEvent): boolean => {
    const tipos = Array.from(e.dataTransfer?.types ?? [])
    return tipos.includes('Files') || tipos.includes(TIPO_ITEM)
  }
  /** Soltar um item nele mesmo ou dentro dele não faz sentido: a pasta não acende. */
  const destinoProibido = (dest: string): boolean => {
    const a = arrastado.current
    return !!a && (dest === a || dest.startsWith(a + '/') || dest === paiDe(a))
  }
  const arrastoSobre = (e: DragEvent, dest: string): void => {
    if (!ehArrasto(e)) return
    e.preventDefault()
    e.stopPropagation()
    setSobrevoando(false)
    if (destinoProibido(dest)) {
      e.dataTransfer.dropEffect = 'none'
      if (soltarEm !== null) setSoltarEm(null)
      return
    }
    e.dataTransfer.dropEffect = arrastado.current ? 'move' : 'copy'
    if (soltarEm !== dest) setSoltarEm(dest)
  }
  const soltarNa = (e: DragEvent, dest: string): void => {
    if (!ehArrasto(e)) return
    e.preventDefault()
    e.stopPropagation()
    setSoltarEm(null)
    const item = arrastado.current
    arrastado.current = null
    if (item) { if (!destinoProibido(dest)) void moverItem(item, dest) }
    else if (e.dataTransfer.files.length > 0) void copiarSoltos(dest, e.dataTransfer.files)
  }

  /** O erro do processo principal sem o "Error invoking remote method…" na frente. */
  const motivoDe = (e: unknown, padrao: string): string =>
    e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : padrao

  /**
   * Depois de mover ou renomear, tudo que apontava para o caminho antigo
   * (pastas abertas, arquivo aberto, foco) passa a apontar para o novo.
   */
  const seguirCaminho = (de: string, para: string): void => {
    const troca = (p: string): string => (p === de ? para : p.startsWith(de + '/') ? para + p.slice(de.length) : p)
    setAbertas(a => new Set([...a].map(troca)))
    setArquivo(a => (a ? troca(a) : a))
    setVisor(v => (v ? { ...v, rel: troca(v.rel) } : v))
    setFoco(f => (f ? { ...f, rel: troca(f.rel) } : f))
  }

  const moverItem = async (rel: string, dest: string): Promise<void> => {
    if (!raiz) return
    setAvisoArvore(null)
    try {
      const { rel: novo } = await window.vaultApi.moverItem(raiz, rel, dest)
      seguirCaminho(rel, novo)
      if (dest) setAbertas(a => new Set(a).add(dest))
      await Promise.all([lerPasta(raiz, paiDe(rel)), lerPasta(raiz, dest)])
      rolarPara.current = novo
      setChegaram(new Set([novo]))
      setTimeout(() => setChegaram(new Set()), 1600)
    } catch (e) { setAvisoArvore(motivoDe(e, 'não deu para mover')) }
  }

  const renomearItem = async (rel: string, nome: string): Promise<void> => {
    setRenomeando(null)
    const atual = rel.slice(rel.lastIndexOf('/') + 1)
    if (!raiz || !nome.trim() || nome.trim() === atual) return
    setAvisoArvore(null)
    try {
      const { rel: novo } = await window.vaultApi.renomearItem(raiz, rel, nome)
      seguirCaminho(rel, novo)
      await lerPasta(raiz, paiDe(rel))
      setChegaram(new Set([novo]))
      setTimeout(() => setChegaram(new Set()), 1600)
    } catch (e) { setAvisoArvore(motivoDe(e, 'não deu para renomear')) }
  }

  /** Manda para a Lixeira do Windows — dá para recuperar de lá. Pergunta antes. */
  const excluirItem = async (it: EntradaDev): Promise<void> => {
    if (!raiz) return
    const oque = it.pasta ? `a pasta "${it.nome}" e tudo dentro dela` : `"${it.nome}"`
    if (!window.confirm(`Mandar ${oque} para a Lixeira?`)) return
    setAvisoArvore(null)
    try {
      await window.vaultApi.excluirItem(raiz, it.rel)
      const dentro = (p: string | null | undefined): boolean => !!p && (p === it.rel || p.startsWith(it.rel + '/'))
      if (dentro(arquivo)) { setArquivo(null); setTexto(''); setGravado('') }
      if (dentro(visor?.rel)) setVisor(null)
      if (dentro(foco?.rel)) setFoco(null)
      setAbertas(a => new Set([...a].filter(p => !dentro(p))))
      await lerPasta(raiz, paiDe(it.rel))
    } catch (e) { setAvisoArvore(motivoDe(e, 'não deu para excluir')) }
  }

  const abrirNoPadrao = async (rel: string): Promise<void> => {
    if (!raiz) return
    const r = await window.vaultApi.abrirNoPadrao(raiz, rel).catch(e => ({ ok: false, motivo: motivoDe(e, '') }))
    if (!r.ok) setAvisoArvore(`Não abriu: ${r.motivo ?? 'sem programa para este tipo'}`)
  }

  /**
   * Foto e PDF abrem numa visualização; o resto (zip, exe…) mostra um botão
   * para abrir no programa padrão. Pedido do dono — antes eram "binário"
   * parados, sem clique.
   */
  const abrirVisor = async (it: EntradaDev): Promise<void> => {
    if (!raiz) return
    if (texto !== gravado && !window.confirm('Trocar de arquivo sem salvar as mudanças?')) return
    setFoco({ rel: it.rel, pasta: false })
    setArquivo(null); setTexto(''); setGravado('')
    if (!EXT_MIDIA.has(extensao(it.nome))) {
      setVisor({ rel: it.rel, tipo: 'outro', url: '', tamanho: it.tamanho })
      return
    }
    try {
      const m = await window.vaultApi.lerMidia(raiz, it.rel)
      const bytes = Uint8Array.from(atob(m.base64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: m.tipo }))
      setVisor({ rel: it.rel, tipo: m.tipo, url, tamanho: it.tamanho })
    } catch (e) {
      setVisor({ rel: it.rel, tipo: 'outro', url: '', tamanho: it.tamanho })
      setAvisoArvore(motivoDe(e, 'não deu para mostrar'))
    }
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
    setVisor(null)
    setArquivo(rel)
    setTexto(c)
    setGravado(c)
  }

  /** Fecha o arquivo aberto. Com mudança não salva, pergunta antes. */
  const fecharArquivo = (): void => {
    if (texto !== gravado && !window.confirm('Fechar sem salvar as mudanças?')) return
    setVisor(null)
    setArquivo(null)
    setTexto('')
    setGravado('')
    setAmplo(false)
    setSemArvore(false)
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
      const ext = it.pasta ? undefined : extensao(it.nome)
      const destino = it.pasta ? it.rel : paiDe(it.rel)
      const cabeca = (
        <>
          <span className="dev-seta" aria-hidden="true">{it.pasta ? '›' : ''}</span>
          <span className="dev-icone" aria-hidden="true" />
        </>
      )
      // Renomeando: o nome vira campo. Enter ou sair do campo grava; Esc desiste.
      if (renomeando === it.rel) {
        return [
          <div key={it.rel} className="dev-item dev-item-renomear" style={recuo} data-pasta={it.pasta} data-ext={ext}>
            {cabeca}
            <input
              className="dev-renomear"
              defaultValue={it.nome}
              autoFocus
              onFocus={e => {
                // Seleciona o nome sem a extensão, como o Explorer.
                const ponto = it.pasta ? -1 : it.nome.lastIndexOf('.')
                e.currentTarget.setSelectionRange(0, ponto > 0 ? ponto : it.nome.length)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void renomearItem(it.rel, e.currentTarget.value) }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenomeando(null) }
              }}
              onBlur={e => void renomearItem(it.rel, e.currentTarget.value)}
            />
          </div>,
          ...(aberta ? linhas(it.rel, nivel + 1) : [])
        ]
      }
      const linha = (
        <button
          key={it.rel}
          className="dev-item"
          style={recuo}
          aria-current={arquivo === it.rel || visor?.rel === it.rel}
          aria-expanded={it.pasta ? aberta : undefined}
          data-pasta={it.pasta}
          data-ext={ext}
          data-rel={it.rel}
          data-soltar={it.pasta && soltarEm === it.rel}
          data-dentro={!!soltarEm && it.rel.startsWith(soltarEm + '/')}
          data-chegou={chegaram.has(it.rel)}
          data-arrastando={arrastado.current === it.rel}
          title={it.pasta ? it.rel : `${it.rel} · ${Math.max(1, Math.round(it.tamanho / 1024))} kB`}
          draggable
          onDragStart={e => {
            arrastado.current = it.rel
            e.dataTransfer.setData(TIPO_ITEM, it.rel)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => { arrastado.current = null; setSoltarEm(null) }}
          // Soltar num arquivo é soltar na pasta dele, como no VS Code.
          onDragOver={e => arrastoSobre(e, destino)}
          onDrop={e => soltarNa(e, destino)}
          onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, it }) }}
          onKeyDown={e => {
            if (e.key === 'F2') { e.preventDefault(); setRenomeando(it.rel) }
            else if (e.key === 'Delete') { e.preventDefault(); void excluirItem(it) }
          }}
          onClick={() => {
            if (it.pasta) alternarPasta(it.rel)
            else if (it.rel === arquivo || it.rel === visor?.rel) return
            else if (it.editavel) {
              if (texto !== gravado && !window.confirm('Trocar de arquivo sem salvar as mudanças?')) return
              setFoco({ rel: it.rel, pasta: false })
              void abrirArquivo(it.rel)
            } else void abrirVisor(it)
          }}
        >
          {cabeca}
          <span className="dev-nome">{it.nome}</span>
          {!it.pasta && !it.editavel && !EXT_MIDIA.has(ext ?? '') && <span className="dev-tag">binário</span>}
          <span
            className="dev-mais"
            role="button"
            aria-label={`Ações de ${it.nome}`}
            title="Renomear, excluir…"
            onClick={e => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.left, y: r.bottom + 2, it })
            }}
          >⋯</span>
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

          <div className="dev-corpo" data-amplo={amplo} data-sem-arvore={semArvore && (!!arquivo || !!visor)}>
            <div
              className="dev-arvore"
              role="tree"
              aria-label={`Arquivos de ${nomeRaiz}`}
              data-soltar={soltarEm === ''}
              onDragOver={e => arrastoSobre(e, '')}
              onDrop={e => soltarNa(e, '')}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSoltarEm(null)
              }}
            >
              <div className="dev-arvore-topo">
                <span className="dev-arvore-nome" title={raiz}>{nomeRaiz}</span>
                <span className="dev-arvore-botoes">
                  <button className="btn-icone" title="Recolher pastas" disabled={abertas.size === 0}
                    onClick={() => setAbertas(new Set())}>⊟</button>
                  <button className="btn-icone" title="Ler de novo" onClick={recarregar}>↻</button>
                  {(arquivo || visor) && (
                    <button className="btn-icone" title="Esconder a árvore" onClick={() => setSemArvore(true)}>⇤</button>
                  )}
                </span>
              </div>
              {avisoArvore && (
                <div className="dev-arvore-aviso" role="alert" onClick={() => setAvisoArvore(null)}>{avisoArvore}</div>
              )}
              {linhas('', 0)}
              {soltarEm === '' && <div className="dev-item-vazio">Soltar em {nomeRaiz}</div>}
            </div>

            <div className="dev-editor">
              {visor ? (
                <>
                  <div className="dev-editor-topo">
                    <span className="dev-editor-trilha" title={visor.rel}>
                      {visor.rel.split('/').map((seg, i, todos) => (
                        <span key={i} data-ultimo={i === todos.length - 1}>{seg}</span>
                      ))}
                    </span>
                    <span className="nota-trilha-dir">
                      {semArvore && (
                        <button className="btn-fantasma pequeno" title="Mostrar a árvore" onClick={() => setSemArvore(false)}>
                          ⇥ Arquivos
                        </button>
                      )}
                      <button
                        className="btn-fantasma pequeno"
                        title={amplo ? 'Voltar ao tamanho normal (Esc)' : 'Ampliar na tela toda'}
                        onClick={() => setAmplo(a => !a)}
                      >
                        {amplo ? '⤡ Reduzir' : '⤢ Ampliar'}
                      </button>
                      <button className="btn-fantasma pequeno" onClick={() => void abrirNoPadrao(visor.rel)}>
                        Abrir no app padrão
                      </button>
                      <button className="btn-icone dev-fechar" title="Fechar" onClick={fecharArquivo}>×</button>
                    </span>
                  </div>
                  {visor.tipo.startsWith('image/') ? (
                    <div className="dev-visor"><img src={visor.url} alt={visor.rel} /></div>
                  ) : visor.tipo === 'application/pdf' ? (
                    <iframe className="dev-visor-pdf" src={visor.url} title={visor.rel} />
                  ) : (
                    <div className="dev-visor dev-visor-outro">
                      <span className="dev-visor-nome">{visor.rel.split('/').pop()}</span>
                      <span className="form-dica">
                        {Math.max(1, Math.round(visor.tamanho / 1024))} kB · não é texto, foto nem PDF — abre no programa do Windows.
                      </span>
                      <button className="btn" onClick={() => void abrirNoPadrao(visor.rel)}>Abrir no app padrão</button>
                    </div>
                  )}
                </>
              ) : !arquivo ? (
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
                      <button className="btn-icone dev-fechar" title="Fechar o arquivo" onClick={fecharArquivo}>×</button>
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

      {menu && (
        <>
          <div className="dev-menu-fundo" onMouseDown={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} />
          <div
            className="dev-menu"
            role="menu"
            // Perto da borda, o menu abre para dentro da janela.
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 190) }}
          >
            <span className="dev-menu-titulo">{menu.it.nome}</span>
            {!menu.it.pasta && (
              <button role="menuitem" onClick={() => { const it = menu.it; setMenu(null); void abrirNoPadrao(it.rel) }}>
                Abrir no app padrão
              </button>
            )}
            <button role="menuitem" onClick={() => { const it = menu.it; setMenu(null); aoRevelar(raiz ?? '', it.pasta ? it.rel : paiDe(it.rel)) }}>
              Mostrar no Explorer
            </button>
            <button role="menuitem" onClick={() => { const it = menu.it; setMenu(null); setRenomeando(it.rel) }}>
              Renomear <kbd>F2</kbd>
            </button>
            <span className="dev-menu-dica">Para mover, arraste para outra pasta.</span>
            <button role="menuitem" className="perigo" onClick={() => { const it = menu.it; setMenu(null); void excluirItem(it) }}>
              Excluir <kbd>Del</kbd>
            </button>
          </div>
        </>
      )}

      {janelaNovoProjeto}
    </div>
  )
}
