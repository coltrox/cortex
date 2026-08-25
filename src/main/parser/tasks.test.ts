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

  it('extrai tarefas com terminação CRLF', () => {
    const tasks = extractTasks('- [ ] tarefa 1\r\n- [x] tarefa 2\r\n- algo não-tarefa\r\n- [ ] tarefa 3')
    expect(tasks).toHaveLength(3)
    expect(tasks.map(t => t.text)).toEqual(['tarefa 1', 'tarefa 2', 'tarefa 3'])
    expect(tasks[0]).toEqual({ text: 'tarefa 1', done: false, line: 1 })
    expect(tasks[1]).toEqual({ text: 'tarefa 2', done: true, line: 2 })
    expect(tasks[2]).toEqual({ text: 'tarefa 3', done: false, line: 4 })
    expect(tasks[0].text).not.toContain('\r')
  })
})
