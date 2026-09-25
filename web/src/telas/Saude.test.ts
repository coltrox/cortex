import { describe, it, expect } from 'vitest'
import { segmentoVizinho } from './Saude'

describe('segmentoVizinho — arrastar entre Dia, Dieta, Corpo, Treino e Histórico', () => {
  it('anda para os lados na ordem das abas', () => {
    expect(segmentoVizinho('saude', 1)).toBe('dieta')
    expect(segmentoVizinho('dieta', 1)).toBe('corpo')
    expect(segmentoVizinho('corpo', -1)).toBe('dieta')
    expect(segmentoVizinho('treino', -1)).toBe('corpo')
    // O histórico entrou depois do treino em 24/09/2026: junto da lista de
    // começar um treino ele empurrava o botão de hoje para fora da tela.
    expect(segmentoVizinho('treino', 1)).toBe('historico')
    expect(segmentoVizinho('historico', -1)).toBe('treino')
  })

  it('não dá a volta nas pontas e ignora telas fora da Saúde', () => {
    expect(segmentoVizinho('saude', -1)).toBeNull()
    expect(segmentoVizinho('historico', 1)).toBeNull()
    expect(segmentoVizinho('hoje', 1)).toBeNull()
  })
})
