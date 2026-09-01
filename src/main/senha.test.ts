import { describe, it, expect } from 'vitest'
import { criarSegredo, conferirSenha, MINIMO } from './senha'

describe('senha dos painéis', () => {
  it('aceita a senha certa', () => {
    expect(conferirSenha('abacaxi', criarSegredo('abacaxi'))).toBe(true)
  })

  it('recusa a senha errada', () => {
    expect(conferirSenha('abacaxo', criarSegredo('abacaxi'))).toBe(false)
  })

  it('não guarda a senha em texto puro', () => {
    // O config.json fica dentro do vault, que o Pedro copia e zipa entre
    // máquinas. A senha não pode viajar legível junto.
    expect(criarSegredo('abacaxi')).not.toContain('abacaxi')
  })

  it('dois segredos da mesma senha são diferentes', () => {
    // Sal aleatório: sem ele, duas senhas iguais teriam o mesmo hash e uma
    // tabela pronta resolveria as duas de uma vez.
    expect(criarSegredo('abacaxi')).not.toBe(criarSegredo('abacaxi'))
  })

  it('recusa senha curta demais na criação', () => {
    expect(() => criarSegredo('a'.repeat(MINIMO - 1))).toThrow()
  })

  it('trata acento igual, digitado de qualquer jeito', () => {
    // 'á' pode chegar como um code point ou como 'a' + acento combinante,
    // dependendo do teclado e do sistema. Sem normalizar, a mesma senha
    // digitada no Windows e no celular não confere.
    const composto = 'senáo12'         // 'a' com acento num code point so
    const decomposto = 'senáo12'     // 'a' + acento combinante
    expect(composto).not.toBe(decomposto)  // sem isto o teste nao testa nada
    expect(conferirSenha(decomposto, criarSegredo(composto))).toBe(true)
  })

  it('segredo malformado nunca abre o painel', () => {
    for (const lixo of ['', 'abacaxi', 'scrypt$16384$naohex$naohex', 'scrypt$16384$aa', 'md5$1$aa$bb']) {
      expect(conferirSenha('abacaxi', lixo)).toBe(false)
    }
  })

  it('custo absurdo num arquivo adulterado não trava o app', () => {
    const inicio = Date.now()
    expect(conferirSenha('abacaxi', 'scrypt$999999999$aabb$ccdd')).toBe(false)
    expect(Date.now() - inicio).toBeLessThan(1000)
  })
})
