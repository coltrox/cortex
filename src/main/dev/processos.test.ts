import { describe, it, expect } from 'vitest'
import { semCores } from './processos'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

/**
 * A limpeza da saída do terminal embutido.
 *
 * Existe por causa de um defeito concreto: o Vite pinta o NÚMERO DA PORTA em
 * negrito, o escape cai no meio do endereço, e o link que o painel oferecia
 * levava a `http://localhost:` com bytes de escape grudados.
 */
describe('semCores', () => {
  it('limpa a linha que o Vite imprime, e o endereco sai inteiro', () => {
    // Copiada da saida real de `npm run dev`, com os escapes no lugar exato.
    const bruta = `  ${ESC}[32m>${ESC}[39m  ${ESC}[1mLocal${ESC}[22m:   ` +
      `${ESC}[36mhttp://localhost:${ESC}[1m5173${ESC}[22m/${ESC}[39m`
    const limpa = semCores(bruta)

    expect(limpa).toBe('  >  Local:   http://localhost:5173/')
    // O que quebrava: a porta ficava separada do resto por um escape, e o
    // link parava em "http://localhost:".
    expect(limpa).toContain('http://localhost:5173/')
    expect(limpa).not.toContain(ESC)
  })

  it('tira sequencia OSC, que e como o terminal recebe titulo e link', () => {
    // OSC termina em BEL ou em ESC\ -- as duas formas aparecem na pratica.
    expect(semCores(`${ESC}]0;titulo da janela${BEL}npm run dev`)).toBe('npm run dev')
    expect(semCores(`${ESC}]8;;http://x${ESC}\\rotulo`)).toBe('rotulo')
  })

  it('linha sem cor nenhuma passa intacta', () => {
    // A maioria das linhas e assim, e mexer nelas seria estragar a saida.
    const linha = 'VITE v7.3.6  ready in 431 ms'
    expect(semCores(linha)).toBe(linha)
  })

  it('nao come texto legitimo que parece escape', () => {
    // Colchetes e cifroes aparecem em log de verdade. Sem o ESC na frente,
    // nada disso e sequencia de controle.
    const linha = 'erro em [src/app.ts:12] -> ver $HOME/.cache'
    expect(semCores(linha)).toBe(linha)
  })

  it('aguenta varias sequencias na mesma linha', () => {
    const bruta = `${ESC}[2m19:07${ESC}[22m ${ESC}[36m[vite]${ESC}[39m ${ESC}[32mpronto${ESC}[39m`
    expect(semCores(bruta)).toBe('19:07 [vite] pronto')
  })
})
