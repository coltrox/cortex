import { useCallback, useEffect, useState } from 'react'
import type { NoteRow } from '../shared/types'

export function useVault() {
  const [root, setRoot] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!root) return
    try {
      setNotes(await window.vaultApi.invoke('note:list', {}) as NoteRow[])
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [root])

  useEffect(() => { void recarregar() }, [recarregar])
  useEffect(() => window.vaultApi.onVaultChange(() => void recarregar()), [recarregar])

  const escolher = async (): Promise<void> => {
    try {
      const r = await window.vaultApi.pickVault()
      if (r) setRoot(r.root)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const abrir = async (path: string): Promise<void> => {
    try {
      const r = await window.vaultApi.invoke('note:read', { path }) as { content: string }
      setAberta(path)
      setConteudo(r.content)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const salvar = async (): Promise<void> => {
    if (!aberta) return
    try {
      await window.vaultApi.invoke('note:write', { path: aberta, content: conteudo })
      await recarregar()
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return { root, notes, aberta, conteudo, setConteudo, escolher, abrir, salvar, erro }
}
