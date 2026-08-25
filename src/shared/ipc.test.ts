import { describe, it, expect } from 'vitest'
import { IPC_SCHEMAS } from './ipc'

describe('IPC_SCHEMAS', () => {
  it('rejeita caminho vazio em note:read', () => {
    expect(IPC_SCHEMAS['note:read'].safeParse({ path: '' }).success).toBe(false)
  })

  it('aceita payload válido de note:write', () => {
    expect(IPC_SCHEMAS['note:write'].safeParse({ path: 'a.md', content: 'x' }).success).toBe(true)
  })

  it('aplica limite padrão na busca', () => {
    expect(IPC_SCHEMAS['search:fulltext'].parse({ q: 'nima' }).limit).toBe(50)
  })

  it('recusa limite acima do teto', () => {
    expect(IPC_SCHEMAS['search:fulltext'].safeParse({ q: 'x', limit: 5000 }).success).toBe(false)
  })

  it('recusa campo desconhecido', () => {
    expect(IPC_SCHEMAS['note:read'].safeParse({ path: 'a.md', extra: 1 }).success).toBe(false)
  })
})
