import { describe, it, expect } from 'vitest'
import { ehOuContem } from './caminhos'

const win = process.platform === 'win32'
/** Uma raiz que existe nos dois sistemas, para o teste valer em ambos. */
const R = win ? 'C:\\Users\\ph\\AppData\\Roaming' : '/home/ph/.config'
const j = (...p: string[]): string => [R, ...p].join(win ? '\\' : '/')

describe('a pasta escolhida engole a prateleira dos vaults?', () => {
  /* O que o Cortex pergunta de verdade em `abrirVault`: `pastaDosVaults()`. */
  const prateleira = j('Cortex', 'vaults')
  const dadosDoApp = j('Cortex')

  it('a própria prateleira: sim', () => {
    // O caso real: o diálogo abre DENTRO de `Cortex\vaults`, e um clique para
    // cima cai na propria prateleira. Aberta como vault, ela ganha um
    // `.vault` com id NOVO e as pastas de area nascem em volta dos vaults de
    // verdade -- e o celular passa a publicar num id que ninguem escuta.
    expect(ehOuContem(prateleira, prateleira)).toBe(true)
  })

  it('a pasta de dados do app, que fica acima: sim', () => {
    // Dois cliques para cima. Esta era a unica pergunta da primeira versao da
    // guarda, e por isso a prateleira passava batido.
    expect(ehOuContem(dadosDoApp, prateleira)).toBe(true)
  })

  it('e qualquer pasta acima dela: sim', () => {
    // Pior ainda: o Cortex indexaria markdown de todo programa instalado.
    expect(ehOuContem(R, prateleira)).toBe(true)
  })

  it('um vault DENTRO da prateleira: não', () => {
    // `Cortex\vaults\Cortex` e o lugar certo -- bloquear aqui proibiria o
    // unico caminho legitimo.
    expect(ehOuContem(j('Cortex', 'vaults', 'Cortex'), prateleira)).toBe(false)
  })

  it('uma pasta ao lado: não', () => {
    expect(ehOuContem(j('Outra'), prateleira)).toBe(false)
  })

  it('nome que só COMEÇA igual não conta como conter', () => {
    // `vaults2` não é `vaults`, mas uma comparação por prefixo de texto diria
    // que sim -- e proibiria um vault legitimo por causa do nome.
    expect(ehOuContem(j('Cortex', 'vaults2'), prateleira)).toBe(false)
  })

  it('caminho com `..` no meio é resolvido antes de comparar', () => {
    expect(ehOuContem(j('Cortex', 'vaults', 'Cortex', '..'), prateleira)).toBe(true)
  })

  it.runIf(win)('no Windows a caixa das letras não distingue pastas', () => {
    expect(ehOuContem(prateleira.toUpperCase(), prateleira)).toBe(true)
  })

  it.runIf(win)('discos diferentes nunca se contêm', () => {
    expect(ehOuContem('D:\\vault', prateleira)).toBe(false)
  })
})
