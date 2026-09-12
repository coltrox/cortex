import { describe, it, expect } from 'vitest'
import { guardadoDeMemoria } from './guardado'
import { qualSistema, viuTutorial, marcarTutorialVisto } from './instalar'

/**
 * Saber em que aparelho o site abriu.
 *
 * O gesto de instalar esta escondido num menu, e e um menu DIFERENTE em cada
 * sistema. Mostrar as duas instrucoes lado a lado obrigaria a pessoa a
 * descobrir qual e a dela -- que e o trabalho que o aviso deveria poupar.
 */
describe('qualSistema', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile'
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari'
  const IPAD_ANTIGO = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 Safari'
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari'
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126'

  it('reconhece o Android', () => {
    expect(qualSistema(ANDROID)).toBe('android')
  })

  it('reconhece o iPhone', () => {
    expect(qualSistema(IPHONE)).toBe('iphone')
  })

  it('reconhece o iPad, velho e novo', () => {
    expect(qualSistema(IPAD_ANTIGO)).toBe('iphone')
    // Desde o iOS 13 o iPad se anuncia como Macintosh. So o toque o denuncia.
    expect(qualSistema(MAC, 5)).toBe('iphone')
  })

  it('Mac de verdade nao e iPad -- nenhum Mac reporta varios toques', () => {
    expect(qualSistema(MAC, 0)).toBe('outro')
  })

  it('computador cai em "outro", onde instalar nao faz sentido', () => {
    expect(qualSistema(WINDOWS)).toBe('outro')
  })

  it('nao se importa com a caixa das letras', () => {
    expect(qualSistema(ANDROID.toUpperCase())).toBe('android')
    expect(qualSistema(IPHONE.toUpperCase())).toBe('iphone')
  })

  it('user agent vazio nao quebra', () => {
    expect(qualSistema('')).toBe('outro')
  })
})

describe('o tutorial aparece uma vez so', () => {
  it('a primeira visita ainda nao viu', () => {
    expect(viuTutorial(guardadoDeMemoria())).toBe(false)
  })

  it('depois de marcado, nao volta', () => {
    const g = guardadoDeMemoria()
    marcarTutorialVisto(g)
    expect(viuTutorial(g)).toBe(true)
  })

  it('valor estranho no armazenamento conta como nao visto', () => {
    // `localStorage` e texto que qualquer script da pagina pode escrever.
    // Errar para o lado de mostrar de novo custa um toque; errar para o outro
    // esconderia o tutorial de quem nunca o viu.
    const g = guardadoDeMemoria()
    g.gravar('cortex.viu-instalar', 'talvez')
    expect(viuTutorial(g)).toBe(false)
  })
})
