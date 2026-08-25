import { useCallback, useEffect, useState } from 'react'
import type { NoteRow } from '../shared/types'

export function useVault() {
  const [root, setRoot] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState('')

  const recarregar = useCallback(async () => {
    if (!root) return
    setNotes(await window.vaultApi.invoke('note:list', {}) as NoteRow[])
  }, [root])

  useEffect(() => { void recarregar() }, [recarregar])
  useEffect(() => window.vaultApi.onVaultChange(() => void recarregar()), [recarregar])

  const escolher = async (): Promise<void> => {
    const r = await window.vaultApi.pickVault()
    if (r) setRoot(r.root)
  }

  const abrir = async (path: string): Promise<void> => {
    const r = await window.vaultApi.invoke('note:read', { path }) as { content: string }
    setAberta(path)
    setConteudo(r.content)
  }

  const salvar = async (): Promise<void> => {
    if (!aberta) return
    await window.vaultApi.invoke('note:write', { path: aberta, content: conteudo })
    await recarregar()
  }

  return { root, notes, aberta, conteudo, setConteudo, escolher, abrir, salvar }
}
