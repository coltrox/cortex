import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NoteComCampos } from './tipos'
import { subPadrao } from './subnav'
import { FORMULARIOS } from './formularios'

export type Lente =
  | 'hoje' | 'vida' | 'saude' | 'dev' | 'conhecimento' | 'financas' | 'calendario'

export type Link = { dst: string; resolvedPath: string | null; line: number }
export type Backlink = { path: string; title: string; line: number }
export type Config = { areas: string[]; pastasDev: string[]; escolheu: boolean }
export type EntradaDev = { nome: string; rel: string; pasta: boolean; tamanho: number; editavel: boolean }

/** Agrupa por pasta de primeiro nível — a raiz vira um grupo próprio. */
export function agruparPorPasta(notas: NoteComCampos[]): [string, NoteComCampos[]][] {
  const grupos = new Map<string, NoteComCampos[]>()
  for (const n of notas) {
    const barra = n.path.indexOf('/')
    const pasta = barra === -1 ? 'Raiz' : n.path.slice(0, barra)
    const atual = grupos.get(pasta)
    if (atual) atual.push(n)
    else grupos.set(pasta, [n])
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
}

/** Higieniza um título para virar nome de arquivo válido em qualquer sistema. */
export function nomeArquivo(s: string): string {
  return s.replace(/[/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function useVault() {
  const [root, setRoot] = useState<string | null>(null)
  const [config, setConfig] = useState<Config>({ areas: [], pastasDev: [], escolheu: false })
  const [notas, setNotas] = useState<NoteComCampos[]>([])
  const [pastas, setPastas] = useState<string[]>([])
  const [lente, setLenteBruta] = useState<Lente>('hoje')
  const [sub, setSub] = useState<string>('overview')
  const [filtro, setFiltro] = useState('')

  // A nota aberta é ortogonal à lente: ela aparece POR CIMA de Estudos, de Dev
  // ou de onde o Ctrl+K a chamou. Não existe mais uma lente "Notas" para onde
  // o app te joga — abrir um conteúdo não deve tirar você de onde estava.
  const [aberta, setAberta] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState('')
  const [salvo, setSalvo] = useState('')
  const [editando, setEditando] = useState(false)
  const [saindo, setSaindo] = useState<Link[]>([])
  const [entrando, setEntrando] = useState<Backlink[]>([])

  const [erro, setErro] = useState<string | null>(null)
  const falhou = (e: unknown): void => setErro(e instanceof Error ? e.message : String(e))

  const recarregar = useCallback(async () => {
    if (!root) return
    try {
      // `note:list-fields` é superconjunto de `note:list`: traz as mesmas
      // colunas mais o frontmatter reidratado, que é o que as lentes consomem.
      const [ns, ps] = await Promise.all([
        window.vaultApi.invoke('note:list-fields', {}),
        window.vaultApi.invoke('folder:list', {})
      ])
      setNotas(ns as NoteComCampos[])
      setPastas(ps as string[])
      setErro(null)
    } catch (e) { falhou(e) }
  }, [root])

  useEffect(() => { void recarregar() }, [recarregar])
  useEffect(() => window.vaultApi.onVaultChange(() => void recarregar()), [recarregar])

  // O processo principal reabre o último vault sozinho; pode terminar antes ou
  // depois do primeiro render, então ouvimos o aviso E perguntamos o estado.
  useEffect(() => {
    const parar = window.vaultApi.onVaultAberto(e => {
      if (e.root) { setRoot(e.root); if (e.config) setConfig(e.config) }
    })
    void window.vaultApi.estadoVault().then(e => {
      if (e.root) { setRoot(e.root); if (e.config) setConfig(e.config) }
    }).catch(() => {})
    return parar
  }, [])

  const carregarLinks = useCallback(async (path: string) => {
    try {
      const [out, back] = await Promise.all([
        window.vaultApi.invoke('links:outlinks', { path }),
        window.vaultApi.invoke('links:backlinks', { path })
      ])
      setSaindo(out as Link[])
      setEntrando(back as Backlink[])
    } catch {
      // Links são contexto, não conteúdo: se falharem, a nota ainda abre.
      setSaindo([])
      setEntrando([])
    }
  }, [])

  /* ---------- abertura do vault ---------- */

  const aplicarEstado = (e: { root: string | null; config: Config | null } | null): void => {
    if (!e?.root) return
    setRoot(e.root)
    if (e.config) setConfig(e.config)
  }

  const escolher = async (): Promise<void> => {
    try { aplicarEstado(await window.vaultApi.pickVault()); setErro(null) } catch (e) { falhou(e) }
  }
  const criarVault = async (): Promise<void> => {
    try { aplicarEstado(await window.vaultApi.criarVault()); setErro(null) } catch (e) { falhou(e) }
  }
  const salvarAreas = useCallback(async (areas: string[]): Promise<void> => {
    try {
      setConfig(await window.vaultApi.invoke('config:areas', { areas }) as Config)
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar])

  /* ---------- notas ---------- */

  const abrir = useCallback(async (path: string): Promise<void> => {
    try {
      const r = await window.vaultApi.invoke('note:read', { path }) as { content: string }
      setAberta(path)
      setConteudo(r.content)
      setSalvo(r.content)
      setEditando(false)
      setErro(null)
      void carregarLinks(path)
    } catch (e) { falhou(e) }
  }, [carregarLinks])

  const fechar = useCallback((): void => {
    setAberta(null)
    setConteudo('')
    setSalvo('')
    setEditando(false)
  }, [])

  /** Abre pelo nome do arquivo, como um wikilink faz. */
  const abrirPorNome = useCallback(async (alvo: string): Promise<void> => {
    const limpo = alvo.replace(/\.md$/i, '').toLowerCase()
    const achou = notas.find(n =>
      n.path.replace(/\.md$/i, '').toLowerCase().endsWith(limpo) ||
      n.title.toLowerCase() === limpo)
    if (!achou) { setErro(`A nota "${alvo}" ainda não existe no vault.`); return }
    await abrir(achou.path)
  }, [notas, abrir])

  const abrirLink = useCallback(async (link: Link): Promise<void> => {
    if (!link.resolvedPath) { setErro(`A nota "${link.dst}" ainda não existe no vault.`); return }
    await abrir(link.resolvedPath)
  }, [abrir])

  const salvar = useCallback(async (): Promise<void> => {
    if (!aberta) return
    try {
      await window.vaultApi.invoke('note:write', { path: aberta, content: conteudo })
      setSalvo(conteudo)
      await recarregar()
      void carregarLinks(aberta)
      setErro(null)
    } catch (e) { falhou(e) }
  }, [aberta, conteudo, recarregar, carregarLinks])

  /** Serializa um valor para o frontmatter. Listas e objetos viram JSON inline. */
  const yaml = (val: unknown): string =>
    typeof val === 'string' ? val : JSON.stringify(val)

  /** Cria uma nota a partir de um formulário. Recusa se já existir. */
  const criar = useCallback(async (
    tipo: string, campos: Record<string, unknown>, pastaAlvo?: string
  ): Promise<string | null> => {
    const form = FORMULARIOS[tipo]
    if (!form) { setErro(`Tipo desconhecido: ${tipo}`); return null }
    const base = form.nomearPor === 'data'
      ? `${tipo}-${String(campos.date ?? '')}`
      : nomeArquivo(String(campos.titulo ?? ''))
    if (!base || base === `${tipo}-`) { setErro('Faltou o nome da nota.'); return null }

    const fm: Record<string, unknown> = { tipo, ...campos }
    const linhas = Object.entries(fm)
      .filter(([, val]) => val !== null && val !== undefined)
      .map(([k, val]) => `${k}: ${yaml(val)}`)
    const corpo = form.corpo ?? ''
    const texto = `---\n${linhas.join('\n')}\n---\n\n### 🕸️ Dependências da Rede\n-\n\n${corpo}`
    const path = `${pastaAlvo ?? form.pasta}/${base}.md`

    try {
      await window.vaultApi.invoke('note:create', { path, content: texto })
      await recarregar()
      setErro(null)
      return path
    } catch (e) { falhou(e); return null }
  }, [recarregar])

  /** Altera campos do frontmatter preservando o corpo. `null` remove a chave. */
  const alterar = useCallback(async (path: string, campos: Record<string, unknown>): Promise<void> => {
    try {
      await window.vaultApi.invoke('note:patch', { path, campos })
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar])

  const excluir = useCallback(async (path: string): Promise<void> => {
    try {
      await window.vaultApi.invoke('note:delete', { path })
      if (aberta === path) fechar()
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar, aberta, fechar])

  const mover = useCallback(async (de: string, paraPasta: string): Promise<void> => {
    const nome = de.slice(de.lastIndexOf('/') + 1)
    const para = paraPasta ? `${paraPasta}/${nome}` : nome
    if (para === de) return
    try {
      await window.vaultApi.invoke('note:move', { de, para })
      if (aberta === de) setAberta(para)
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar, aberta])

  const criarPasta = useCallback(async (pasta: string): Promise<void> => {
    try {
      await window.vaultApi.invoke('folder:create', { pasta })
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar])

  /** Lança um item numa lista do diário do dia, criando o diário se preciso. */
  const lancar = useCallback(async (
    dia: string, campo: string, item: Record<string, unknown>
  ): Promise<void> => {
    const path = `Diario/${dia}.md`
    try {
      await window.vaultApi.invoke('note:ensure', {
        path,
        conteudoInicial: `---\ntipo: diario\ndate: ${dia}\n---\n\n## Como foi o dia\n`
      })
      await window.vaultApi.invoke('note:append', { path, campo, item })
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar])

  /**
   * Grava campos no diário de um dia — o registro diário que reseta sozinho
   * quando o dia vira, porque cada dia é um arquivo diferente. O dia que
   * passou fica gravado do jeito que ficou.
   */
  const marcarNoDia = useCallback(async (
    dia: string, campos: Record<string, unknown>
  ): Promise<void> => {
    const path = `Diario/${dia}.md`
    try {
      await window.vaultApi.invoke('note:ensure', {
        path,
        conteudoInicial: `---\ntipo: diario\ndate: ${dia}\n---\n\n## Como foi o dia\n`
      })
      await window.vaultApi.invoke('note:patch', { path, campos })
      await recarregar()
      setErro(null)
    } catch (e) { falhou(e) }
  }, [recarregar])

  /* ---------- Dev ---------- */

  const autorizarPasta = useCallback(async (): Promise<void> => {
    try {
      const pastasDev = await window.vaultApi.autorizarPastaDev()
      setConfig(c => ({ ...c, pastasDev }))
      setErro(null)
    } catch (e) { falhou(e) }
  }, [])

  const removerPasta = useCallback(async (raiz: string): Promise<void> => {
    try {
      setConfig(await window.vaultApi.invoke('dev:remove-folder', { raiz }) as Config)
      setErro(null)
    } catch (e) { falhou(e) }
  }, [])

  const arvoreDev = useCallback(async (raiz: string, subPasta: string): Promise<EntradaDev[]> => {
    try {
      return await window.vaultApi.invoke('dev:tree', { raiz, sub: subPasta }) as EntradaDev[]
    } catch (e) { falhou(e); return [] }
  }, [])

  const lerArquivo = useCallback(async (raiz: string, arquivo: string): Promise<string | null> => {
    try {
      const r = await window.vaultApi.invoke('dev:read', { raiz, arquivo }) as { conteudo: string }
      setErro(null)
      return r.conteudo
    } catch (e) { falhou(e); return null }
  }, [])

  const gravarArquivo = useCallback(async (
    raiz: string, arquivo: string, conteudoArq: string
  ): Promise<boolean> => {
    try {
      await window.vaultApi.invoke('dev:write', { raiz, arquivo, conteudo: conteudoArq })
      setErro(null)
      return true
    } catch (e) { falhou(e); return false }
  }, [])

  const abrirTerminal = useCallback(async (raiz: string, subPasta = ''): Promise<void> => {
    try { await window.vaultApi.abrirTerminal(raiz, subPasta); setErro(null) } catch (e) { falhou(e) }
  }, [])

  const revelar = useCallback(async (raiz: string, subPasta = ''): Promise<void> => {
    try { await window.vaultApi.abrirNoExplorador(raiz, subPasta); setErro(null) } catch (e) { falhou(e) }
  }, [])

  /* ---------- derivados ---------- */

  const visiveis = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return notas
    return notas.filter(n =>
      n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
  }, [notas, filtro])

  const notaAberta = useMemo(
    () => notas.find(n => n.path === aberta) ?? null,
    [notas, aberta]
  )

  const setLente = useCallback((l: Lente): void => {
    setLenteBruta(l)
    setSub(subPadrao(l))
    setAberta(null)
  }, [])

  return {
    root, config, notas, pastas, visiveis, notaAberta,
    lente, setLente, sub, setSub,
    filtro, setFiltro,
    aberta, conteudo, setConteudo, editando, setEditando,
    sujo: conteudo !== salvo,
    saindo, entrando,
    escolher, criarVault, salvarAreas,
    abrir, abrirPorNome, abrirLink, fechar, salvar,
    criar, alterar, excluir, mover, criarPasta, lancar, marcarNoDia,
    autorizarPasta, removerPasta, arvoreDev, lerArquivo, gravarArquivo, abrirTerminal, revelar,
    erro, limparErro: () => setErro(null)
  }
}
