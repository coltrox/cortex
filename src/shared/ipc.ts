import { z } from 'zod'

const caminho = z.string().min(1).max(1024)
  .refine(p => !p.includes('\\'), { message: 'caminho deve usar apenas "/" (POSIX), não "\\"' })
  .refine(p => p.toLowerCase().endsWith('.md'), { message: 'caminho deve terminar em .md' })
  .refine(p => p.split('/').every(seg => !seg.startsWith('.')), {
    message: 'caminho não pode conter segmentos que comecem com "." (ex.: .vault, ou ".." usado para escapar da raiz)'
  })

export const IPC_SCHEMAS = {
  'note:read': z.object({ path: caminho }).strict(),
  'note:write': z.object({ path: caminho, content: z.string().max(5_000_000) }).strict(),
  'note:list': z.object({
    tipo: z.string().max(64).optional(),
    project: z.string().max(200).optional()
  }).strict(),
  'note:list-fields': z.object({
    tipo: z.string().max(64).optional(),
    project: z.string().max(200).optional(),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }).strict(),
  'note:create': z.object({
    path: caminho,
    content: z.string().max(5_000_000)
  }).strict(),
  // O app passa a escrever frontmatter quando edita por formulário — ação
  // explícita, nunca automática (emenda à constraint original "o app nunca
  // reescreve frontmatter que o autor digitou"). Estes três canais são essa
  // ação explícita; nada mais no app pode usá-los por conta própria.
  'note:patch': z.object({
    path: caminho,
    campos: z.record(z.string().max(64), z.unknown())
  }).strict(),
  'note:append': z.object({
    path: caminho,
    campo: z.string().max(64),
    item: z.record(z.string().max(64), z.unknown())
  }).strict(),
  'note:ensure': z.object({
    path: caminho,
    conteudoInicial: z.string().max(5_000_000)
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
