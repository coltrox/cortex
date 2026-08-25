import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NoteRow } from '../shared/types'

export type Lente =
  | 'hoje' | 'notas' | 'vida' | 'saude'
  | 'dev' | 'conhecimento' | 'financas' | 'calendario'

/** Lentes que a Fundação já sustenta com dados reais. O resto espera o plano seguinte. */
export const LENTES_ATIVAS: Lente[] = ['notas', 'dev']

export type Link = { dst: string; resolvedPath: string | null; line: number }
export type Backlink = { path: string; title: string; line: number }

/** O que o filtro de cada lente faz sobre a lista completa de notas. */
function filtrarPorLente(notas: NoteRow[], lente: Lente): NoteRow[] {
  if (lente === 'dev') return notas.filter(n => n.tipo === 'projeto')
  return notas
}

/** Agrupa por pasta de primeiro nível — a raiz vira um grupo próprio. */
export function agruparPorPasta(notas: NoteRow[]): [string, NoteRow[]][] {
  const grupos = new Map<string, NoteRow[]>()
  for (const n of notas) {
    const barra = n.path.indexOf('/')
    const pasta = barra === -1 ? 'Raiz' : n.path.slice(0, barra)
    const atual = grupos.get(pasta)
    if (atual) atual.push(n)
    else grupos.set(pasta, [n])
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
}

export function useVault() {
  const [root, setRoot] = useState<string | null>(null)
  const [notas, setNotas] = useState<NoteRow[]>([])
  const [lente, setLente] = useState<Lente>('notas')
  const [filtro, setFiltro] = useState('')

  const [aberta, setAberta] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState('')
  const [salvo, setSalvo] = useState('')
  const [saindo, setSaindo] = useState<Link[]>([])
  const [entrando, setEntrando] = useState<Backlink[]>([])

  const [erro, setErro] = useState<string | null>(null)

  const falhou = (e: unknown) => setErro(e instanceof Error ? e.message : String(e))

  const recarregar = useCallback(async () => {
    if (!root) return
    try {
      setNotas(await window.vaultApi.invoke('note:list', {}) as NoteRow[])
      setErro(null)
    } catch (e) { falhou(e) }
  }, [root])

  useEffect(() => { void recarregar() }, [recarregar])
  useEffect(() => window.vaultApi.onVaultChange(() => void recarregar()), [recarregar])

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

  const escolher = async (): Promise<void> => {
    try {
      const r = await window.vaultApi.pickVault()
      if (r) setRoot(r.root)
      setErro(null)
    } catch (e) { falhou(e) }
  }

  const abrir = useCallback(async (path: string): Promise<void> => {
    try {
      const r = await window.vaultApi.invoke('note:read', { path }) as { content: string }
      setAberta(path)
      setConteudo(r.content)
      setSalvo(r.content)
      setErro(null)
      void carregarLinks(path)
    } catch (e) { falhou(e) }
  }, [carregarLinks])

  /** Abre pelo alvo de um wikilink, resolvido ou não. */
  const abrirLink = useCallback(async (link: Link): Promise<void> => {
    if (!link.resolvedPath) {
      setErro(`A nota "${link.dst}" ainda não existe no vault.`)
      return
    }
    await abrir(link.resolvedPath)
  }, [abrir])

  const salvar = async (): Promise<void> => {
    if (!aberta) return
    try {
      await window.vaultApi.invoke('note:write', { path: aberta, content: conteudo })
      setSalvo(conteudo)
      await recarregar()
      void carregarLinks(aberta)
      setErro(null)
    } catch (e) { falhou(e) }
  }

  const visiveis = useMemo(() => {
    const base = filtrarPorLente(notas, lente)
    const q = filtro.trim().toLowerCase()
    if (!q) return base
    return base.filter(n =>
      n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
    )
  }, [notas, lente, filtro])

  const notaAberta = useMemo(
    () => notas.find(n => n.path === aberta) ?? null,
    [notas, aberta]
  )

  return {
    root, notas, visiveis, notaAberta,
    lente, setLente,
    filtro, setFiltro,
    aberta, conteudo, setConteudo,
    sujo: conteudo !== salvo,
    saindo, entrando,
    escolher, abrir, abrirLink, salvar,
    erro, limparErro: () => setErro(null)
  }
}
