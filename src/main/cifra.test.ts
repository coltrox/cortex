import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { cifrar, decifrar, estaCifrado, criarCofre, abrirCofre, reenvelopar, MARCA } from './cifra'

const NOTA = '---\ntipo: senha\nusuario: pedro\n---\n\nSenha do banco: 1234\n'

describe('cifrar e decifrar', () => {
  it('volta exatamente o mesmo texto', () => {
    const k = randomBytes(32)
    expect(decifrar(cifrar(NOTA, k), k)).toBe(NOTA)
  })

  it('o texto nao aparece no arquivo cifrado', () => {
    const blob = cifrar(NOTA, randomBytes(32))
    expect(blob).not.toContain('Senha do banco')
    expect(blob).not.toContain('pedro')
    expect(blob).not.toContain('tipo: senha')
  })

  it('cifrar duas vezes o mesmo texto da resultados diferentes', () => {
    // IV sorteado por escrita. Sem isso, dois arquivos de conteudo igual
    // teriam bytes iguais, e daria para saber que sao iguais sem abrir nenhum.
    const k = randomBytes(32)
    expect(cifrar(NOTA, k)).not.toBe(cifrar(NOTA, k))
  })

  it('chave errada nao decifra -- e nao devolve lixo', () => {
    const blob = cifrar(NOTA, randomBytes(32))
    expect(() => decifrar(blob, randomBytes(32))).toThrow()
  })

  it('um byte trocado no disco e detectado', () => {
    // E a garantia do GCM: melhor falhar do que devolver texto corrompido,
    // que o parser aceitaria e gravaria por cima do original.
    const k = randomBytes(32)
    const linhas = cifrar(NOTA, k).split('\n')
    const corpo = Buffer.from(linhas[3], 'base64')
    corpo[0] = corpo[0] ^ 1
    linhas[3] = corpo.toString('base64')
    expect(() => decifrar(linhas.join('\n'), k)).toThrow()
  })

  it('arquivo malformado nao passa por decifrado', () => {
    const k = randomBytes(32)
    for (const lixo of ['', 'texto normal', MARCA, MARCA + '\nso-uma-linha']) {
      expect(() => decifrar(lixo, k)).toThrow()
    }
  })

  it('reconhece arquivo cifrado pela marca', () => {
    expect(estaCifrado(cifrar(NOTA, randomBytes(32)))).toBe(true)
    expect(estaCifrado(NOTA)).toBe(false)
    expect(estaCifrado('')).toBe(false)
  })

  it('sobrevive a acento, emoji e quebras de linha do Windows', () => {
    const k = randomBytes(32)
    const dificil = 'Acao\r\nnao\ne facil \u{1F9E0}\n\n---\n'
    expect(decifrar(cifrar(dificil, k), k)).toBe(dificil)
  })

  it('sobrevive a texto vazio e a texto grande', () => {
    const k = randomBytes(32)
    expect(decifrar(cifrar('', k), k)).toBe('')
    const grande = 'x'.repeat(500_000)
    expect(decifrar(cifrar(grande, k), k)).toBe(grande)
  })
})

describe('cofre da chave-mestra', () => {
  it('a senha certa abre', () => {
    const { cofre, chave } = criarCofre('abacaxi')
    expect(abrirCofre('abacaxi', cofre)?.toString('hex')).toBe(chave.toString('hex'))
  })

  it('a senha errada devolve null, nao lanca', () => {
    const { cofre } = criarCofre('abacaxi')
    expect(abrirCofre('abacaxo', cofre)).toBe(null)
  })

  it('a chave-mestra nao aparece no cofre guardado', () => {
    const { cofre, chave } = criarCofre('abacaxi')
    expect(JSON.stringify(cofre)).not.toContain(chave.toString('base64'))
    expect(JSON.stringify(cofre)).not.toContain(chave.toString('hex'))
    expect(JSON.stringify(cofre)).not.toContain('abacaxi')
  })

  it('trocar a senha nao muda a chave -- por isso o vault nao e recifrado', () => {
    // O ponto inteiro do envelope: a alternativa seria decifrar e recifrar
    // milhares de arquivos a cada troca de senha, e uma queda de energia no
    // meio deixaria metade do vault com cada chave, sem como saber qual.
    const { chave } = criarCofre('abacaxi')
    const novo = reenvelopar(chave, 'melancia')
    expect(abrirCofre('melancia', novo)?.toString('hex')).toBe(chave.toString('hex'))
    expect(abrirCofre('abacaxi', novo)).toBe(null)
  })

  it('arquivo cifrado antes da troca continua abrindo depois', () => {
    const { chave } = criarCofre('abacaxi')
    const blob = cifrar(NOTA, chave)
    const depois = abrirCofre('melancia', reenvelopar(chave, 'melancia'))
    expect(depois).not.toBe(null)
    expect(decifrar(blob, depois as Buffer)).toBe(NOTA)
  })

  it('cofre corrompido nao abre e nao derruba o app', () => {
    for (const ruim of [
      { sal: '', chaveEnvelopada: 'x' },
      { sal: 'naohex', chaveEnvelopada: 'x' },
      { sal: 'aabb', chaveEnvelopada: 'nao e cifra nenhuma' }
    ]) {
      expect(abrirCofre('abacaxi', ruim)).toBe(null)
    }
  })
})
