import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { lerMedidasLocais, guardarMedidasLocais, conciliarMedidas } from './medidasLocais'

const DIA = '2026-09-11'
const ONTEM = '2026-09-10'

describe('o peso e as medidas que ainda nao voltaram do Cortex', () => {
  it('comeca vazio', () => {
    expect(lerMedidasLocais(guardadoDeMemoria(), DIA)).toEqual({})
  })

  it('guarda o que acabou de ser registrado', () => {
    const g = guardadoDeMemoria()
    expect(guardarMedidasLocais(g, DIA, { peso: 62.4 })).toEqual({ peso: 62.4 })
    expect(lerMedidasLocais(g, DIA)).toEqual({ peso: 62.4 })
  })

  it('registrar de novo SUBSTITUI, e nao soma', () => {
    // Medida e um valor, nao um movimento: corrigir a cintura de 71 para 70
    // tem que deixar 70. E o oposto da agua, onde cada toque acrescenta.
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, DIA, { cintura: 71 })
    expect(guardarMedidasLocais(g, DIA, { cintura: 70 })).toEqual({ cintura: 70 })
  })

  it('campos diferentes convivem', () => {
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, DIA, { peso: 62.4 })
    expect(guardarMedidasLocais(g, DIA, { cintura: 71 })).toEqual({ peso: 62.4, cintura: 71 })
  })

  it('valor que nao e medida nao entra', () => {
    // Zero, negativo e texto vindo de um campo mal preenchido. Guardar isso
    // faria a tela mostrar um peso de 0 kg como se fosse verdade.
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, DIA, { peso: 0, cintura: -5, coxa: Number.NaN })
    expect(lerMedidasLocais(g, DIA)).toEqual({})
  })

  it('o pendente de ontem nao aparece hoje', () => {
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, ONTEM, { peso: 62.4 })
    expect(lerMedidasLocais(g, DIA)).toEqual({})
  })

  it('so o dia informado sobrevive a gravacao -- e a poda dos dias antigos', () => {
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, ONTEM, { peso: 62.4 })
    guardarMedidasLocais(g, DIA, { peso: 62 })
    expect(lerMedidasLocais(g, ONTEM)).toEqual({})
  })

  it('o que o Cortex confirmou sai do pendente', () => {
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, DIA, { peso: 62.4, cintura: 71 })
    // O Cortex recebeu o peso e ainda nao a cintura. Apagar as duas faria a
    // cintura sumir da tela antes de existir no vault.
    expect(conciliarMedidas(g, DIA, { peso: 62.4 })).toEqual({ cintura: 71 })
  })

  it('valor diferente do publicado CONTINUA pendente', () => {
    // O vault ainda tem o peso de ontem; o de hoje esta a caminho.
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, DIA, { peso: 62.4 })
    expect(conciliarMedidas(g, DIA, { peso: 63.1 })).toEqual({ peso: 62.4 })
  })

  it('a volta por JSON e YAML nao deixa o valor preso', () => {
    // 62,4 pode voltar como 62,400000000000006 e nunca casar exatamente.
    const g = guardadoDeMemoria()
    guardarMedidasLocais(g, DIA, { peso: 62.4 })
    expect(conciliarMedidas(g, DIA, { peso: 62.400000000000006 })).toEqual({})
  })

  it('texto torto no armazenamento nao derruba a leitura', () => {
    // `localStorage` e texto que qualquer script da pagina pode ter escrito.
    const g = guardadoDeMemoria()
    g.gravar('cortex.medidas', 'isto nao e json')
    expect(lerMedidasLocais(g, DIA)).toEqual({})
  })
})
