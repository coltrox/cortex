import { z } from 'zod'

const caminho = z.string().min(1).max(1024)

export const IPC_SCHEMAS = {
  'vault:open': z.object({ root: z.string().min(1) }).strict(),
  'note:read': z.object({ path: caminho }).strict(),
  'note:write': z.object({ path: caminho, content: z.string().max(5_000_000) }).strict(),
  'note:list': z.object({
    tipo: z.string().max(64).optional(),
    project: z.string().max(200).optional()
  }).strict(),
  'search:fulltext': z.object({
    q: z.string().min(1).max(200),
    limit: z.number().int().positive().max(200).default(50)
  }).strict(),
  'links:backlinks': z.object({ path: caminho }).strict(),
  'links:outlinks': z.object({ path: caminho }).strict(),
  'links:broken': z.object({}).strict()
} as const

export type IpcChannel = keyof typeof IPC_SCHEMAS
export type IpcPayload<C extends IpcChannel> = z.input<(typeof IPC_SCHEMAS)[C]>
