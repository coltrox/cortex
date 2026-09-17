import { describe, it, expect } from 'vitest'
import { filtrarComandos, COMANDOS } from './Paleta'
import { proximaFase, formatarRelogio, type Fase } from './Pomodoro'

describe('filtrarComandos', () => {
  it('sem termo mostra todas as ações', () => {
    expect(filtrarComandos('  ')).toEqual(COMANDOS)
  })

  it('pedaços de palavra acham o comando, sem acento', () => {
    expect(filtrarComandos('reg gas').map(c => c.id)).toEqual(['gasto'])
    expect(filtrarComandos('anotacao').map(c => c.id)).toContain('anotacao')
  })

  it('acha pelas palavras-chave, não só pelo nome', () => {
    expect(filtrarComandos('despesa').map(c => c.id)).toEqual(['gasto'])
    expect(filtrarComandos('timer').map(c => c.id)).toEqual(['pomodoro'])
  })

  it('termo sem ação nenhuma não inventa resultado', () => {
    expect(filtrarComandos('xyzzy')).toEqual([])
  })
})

describe('Pomodoro', () => {
  it('foco vira pausa curta, e o quarto foco vira pausa longa', () => {
    let s: { fase: Fase; ciclos: number } = { fase: 'foco', ciclos: 0 }
    const fases: Fase[] = []
    for (let i = 0; i < 8; i++) { s = proximaFase(s.fase, s.ciclos); fases.push(s.fase) }
    expect(fases).toEqual(['pausa', 'foco', 'pausa', 'foco', 'pausa', 'foco', 'pausa-longa', 'foco'])
  })

  it('formata o relógio em mm:ss arredondando para cima', () => {
    expect(formatarRelogio(25 * 60_000)).toBe('25:00')
    expect(formatarRelogio(59_001)).toBe('01:00')
    expect(formatarRelogio(0)).toBe('00:00')
    expect(formatarRelogio(-5)).toBe('00:00')
  })
})
