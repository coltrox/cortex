import { ipcMain } from 'electron'
import { IPC_SCHEMAS, type IpcChannel } from '../../shared/ipc'
import type { Session } from '../session'
import {
  getNote, listNotes, listNotesWithFields, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from '../index/queries'
import { patchFrontmatter, appendToFrontmatterList } from '../vault/patch'

/**
 * `note:patch`, `note:append` e `note:ensure` são todos ler-modificar-gravar.
 * Duas chamadas concorrentes para o MESMO caminho (ex.: dois lançamentos
 * rápidos de gasto no diário de hoje) não podem interlear leitura e escrita —
 * senão a segunda gravação sobrescreve a primeira em silêncio (mesmo defeito
 * do nome de temporário por PID que já mordeu este projeto: "correto no
 * teste, errado sob concorrência real"). Cada `path` tem sua própria fila:
 * a operação N+1 só começa a ler o disco depois que a N terminou de gravar
 * (sucesso ou falha), mas caminhos diferentes seguem em paralelo.
 */
const filasPorSessao = new WeakMap<Session, Map<string, Promise<unknown>>>()

function serializarPorCaminho<T>(
  session: Session, path: string, tarefa: () => Promise<T>
): Promise<T> {
  let filas = filasPorSessao.get(session)
  if (!filas) { filas = new Map(); filasPorSessao.set(session, filas) }

  const anterior = filas.get(path) ?? Promise.resolve()
  const atual = anterior.then(tarefa, tarefa)
  // A entrada na fila nunca deve rejeitar — senão a PRÓXIMA operação na fila
  // (que só encadeia em `anterior.then(tarefa, tarefa)`) já dispara a partir
  // de uma promise resolvida, o que está correto; mas se guardássemos `atual`
  // diretamente aqui, um `.catch` externo tardio na op N poderia observar
  // "unhandled rejection" nesta referência interna. Guardamos uma cópia
  // silenciada só para servir de marcador de "vez" da fila.
  filas.set(path, atual.then(() => undefined, () => undefined))
  return atual
}

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

    case 'note:list-fields':
      return listNotesWithFields(session.db, {
        tipo: p.tipo, project: p.project, desde: p.desde, ate: p.ate
      })

    case 'note:create': {
      if (await session.vault.exists(p.path)) {
        throw new Error(`nota já existe: ${p.path}`)
      }
      await session.vault.writeAtomic(p.path, p.content)
      await session.indexer.indexFile(p.path)
      return { path: p.path }
    }

    // Frontmatter escrito por formulário — ação explícita do usuário, nunca
    // automática (emenda à constraint "o app nunca reescreve frontmatter que
    // o autor digitou"). Ler-modificar-gravar acontece aqui, no processo
    // principal, serializado por caminho: ver `serializarPorCaminho`.
    case 'note:patch':
      return serializarPorCaminho(session, p.path, async () => {
        const raw = await session.vault.read(p.path)
        const patched = patchFrontmatter(raw, p.campos)
        await session.vault.writeAtomic(p.path, patched)
        await session.indexer.indexFile(p.path)
        return { path: p.path }
      })

    case 'note:append':
      return serializarPorCaminho(session, p.path, async () => {
        const raw = await session.vault.read(p.path)
        const { raw: patched, total } = appendToFrontmatterList(raw, p.campo, p.item)
        await session.vault.writeAtomic(p.path, patched)
        await session.indexer.indexFile(p.path)
        return { path: p.path, total }
      })

    case 'note:ensure':
      return serializarPorCaminho(session, p.path, async () => {
        if (await session.vault.exists(p.path)) {
          return { path: p.path, criada: false }
        }
        await session.vault.writeAtomic(p.path, p.conteudoInicial)
        await session.indexer.indexFile(p.path)
        return { path: p.path, criada: true }
      })

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
