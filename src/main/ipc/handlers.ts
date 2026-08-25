import { ipcMain } from 'electron'
import { IPC_SCHEMAS, type IpcChannel } from '../../shared/ipc'
import type { Session } from '../session'
import {
  getNote, listNotes, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from '../index/queries'

export async function handle(
  session: Session, canal: IpcChannel, bruto: unknown
): Promise<unknown> {
  const schema = IPC_SCHEMAS[canal]
  if (!schema) throw new Error(`canal desconhecido: ${canal}`)

  const parsed = schema.safeParse(bruto ?? {})
  if (!parsed.success) throw new Error(`payload inválido em ${canal}: ${parsed.error.message}`)
  const p = parsed.data as any

  switch (canal) {
    case 'note:read': {
      const content = await session.vault.read(p.path)
      return { content, meta: getNote(session.db, p.path) ?? null }
    }

    case 'note:write':
      await session.vault.writeAtomic(p.path, p.content)
      await session.indexer.indexFile(p.path)
      return { ok: true }

    case 'note:list':
      return listNotes(session.db, { tipo: p.tipo, project: p.project })

    case 'search:fulltext':
      return searchFullText(session.db, p.q, p.limit)

    case 'links:backlinks': return getBacklinks(session.db, p.path)
    case 'links:outlinks':  return getOutlinks(session.db, p.path)
    case 'links:broken':    return getBrokenLinks(session.db)

    default: {
      // Guarda de exaustividade: se um canal novo for acrescentado a IPC_SCHEMAS
      // sem um `case` aqui, o compilador acusa `canal` como não-`never`. Em
      // runtime (payload validado mas canal sem case), falha alto e explícito
      // em vez de devolver `undefined` como se a chamada tivesse tido sucesso.
      const exaustivo: never = canal
      throw new Error(`canal sem handler: ${exaustivo}`)
    }
  }
}

export function registerIpc(session: Session): void {
  for (const canal of Object.keys(IPC_SCHEMAS) as IpcChannel[]) {
    ipcMain.handle(canal, (_e, payload) => handle(session, canal, payload))
  }
}
