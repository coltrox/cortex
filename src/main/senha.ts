import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * A senha dos painéis.
 *
 * O que ela é: uma tranca de tela. Ela impede que alguém que pega o notebook
 * aberto leia a Vida, a Grana ou o Dev sem saber a senha.
 *
 * O que ela NÃO é: criptografia. O vault continua sendo markdown legível em
 * disco — quem abre a pasta no Explorer, no Obsidian ou num bloco de notas lê
 * tudo, com senha ou sem. Nenhum comentário neste arquivo deve dar a entender
 * o contrário, e nenhuma tela do app deve prometer mais do que isto.
 *
 * A senha nunca é guardada. O que vai para o `config.json` é o resultado de
 * um scrypt com sal aleatório, e a conferência acontece aqui, no processo
 * principal: o renderer nunca vê o segredo, nem para comparar.
 */

/**
 * Custo do scrypt.
 *
 * 16384 é o padrão recomendado e leva uns 50 ms nesta máquina — imperceptível
 * ao digitar a senha uma vez, e caro o bastante para tornar um ataque de
 * dicionário sobre o config.json desagradável. Fica gravado dentro do próprio
 * segredo para que aumentar o custo no futuro não invalide as senhas antigas.
 */
const CUSTO = 16384
const TAMANHO_SAL = 16
const TAMANHO_CHAVE = 32

/** Curta demais não protege de nada; o limite existe para dizer isso na hora. */
export const MINIMO = 4

export function criarSegredo(senha: string): string {
  if (senha.length < MINIMO) {
    throw new Error(`a senha precisa ter pelo menos ${MINIMO} caracteres`)
  }
  const sal = randomBytes(TAMANHO_SAL)
  const chave = scryptSync(senha.normalize('NFKC'), sal, TAMANHO_CHAVE, { N: CUSTO })
  return `scrypt$${CUSTO}$${sal.toString('hex')}$${chave.toString('hex')}`
}

/**
 * Confere a senha contra o segredo guardado.
 *
 * Devolve `false` para qualquer segredo malformado em vez de lançar: um
 * `config.json` editado à mão não pode derrubar o app, e também não pode
 * abrir o painel.
 */
export function conferirSenha(senha: string, segredo: string): boolean {
  const partes = segredo.split('$')
  if (partes.length !== 4 || partes[0] !== 'scrypt') return false

  const custo = Number(partes[1])
  // Um custo absurdo vindo de um arquivo adulterado travaria o processo
  // principal por minutos — o teto é a defesa contra isso, não contra o dono.
  if (!Number.isInteger(custo) || custo < 1024 || custo > 1_048_576) return false

  let sal: Buffer
  let esperado: Buffer
  try {
    sal = Buffer.from(partes[2], 'hex')
    esperado = Buffer.from(partes[3], 'hex')
  } catch {
    return false
  }
  if (sal.length === 0 || esperado.length === 0) return false

  const chave = scryptSync(senha.normalize('NFKC'), sal, esperado.length, { N: custo })
  // timingSafeEqual exige comprimentos iguais; a linha acima garante isso ao
  // derivar exatamente o tamanho do que está guardado.
  return timingSafeEqual(chave, esperado)
}
