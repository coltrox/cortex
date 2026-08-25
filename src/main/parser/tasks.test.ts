import { describe, it, expect } from 'vitest'
import { extractTasks } from './tasks'

describe('extractTasks', () => {
  it('extrai tarefa aberta e concluída', () => {
    const tasks = extractTasks('- [ ] rate limiting\n- [x] segredos em .env')
    expect(tasks).toEqual([
      { text: 'rate limiting', done: false, line: 1 },
      { text: 'segredos em .env', done: true, line: 2 }
    ])
  })

  it('aceita indentação e marcador com asterisco', () => {
    const tasks = extractTasks('  * [ ] aninhada')
    expect(tasks).toEqual([{ text: 'aninhada', done: false, line: 1 }])
  })

  it('extrai data de vencimento no formato 📅 YYYY-MM-DD', () => {
    const tasks = extractTasks('- [ ] testar RLS 📅 2026-09-02')
    expect(tasks[0].due).toBe('2026-09-02')
    expect(tasks[0].text).toBe('testar RLS')
  })

  it('ignora item de lista que não é tarefa', () => {
    expect(extractTasks('- só um item')).toEqual([])
  })
})
