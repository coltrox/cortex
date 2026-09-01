import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'

/**
 * A cifra dos painéis trancados.
 *
 * Diferente de `senha.ts`, que só CONFERE uma senha, aqui o conteúdo do vault
 * de fato vira bytes ilegíveis no disco. Um painel trancado é um painel
 * cifrado: o mesmo interruptor decide as duas coisas.
 *
 * ## Chave-mestra envelopada, e por quê
 *
 * A chave que cifra os arquivos é sorteada uma vez e guardada CIFRADA pela
 * senha. Trocar a senha reembrulha essa chave — nada no vault precisa ser
 * reescrito.
 *
 * A alternativa (derivar a chave direto da senha) parece mais simples e é uma
 * armadilha: trocar a senha exigiria decifrar e recifrar todo arquivo
 * trancado, num laço de milhares de escritas que, interrompido no meio por
 * uma queda de energia, deixaria metade do vault com uma chave e metade com
 * outra — sem nenhuma forma de saber qual é qual.
 *
 * ## O que isto não faz
 *
 * Não há recuperação. Perdida a senha, perdido o conteúdo — é o que
 * criptografia significa, e a tela precisa dizer isso antes de ligar.
 */

const CUSTO = 16384
const TAM_SAL = 16
const TAM_CHAVE = 32
const TAM_IV = 12

/** Primeira linha do arquivo cifrado. Serve para detectar, e para dar um aviso
 *  a quem abrir o arquivo num editor esperando markdown. */
export const MARCA = 'CORTEX-CIFRADO-1'

export type Cofre = {
  /** Sal da senha, hex. */
  sal: string
  /** A chave-mestra, cifrada pela senha. */
  chaveEnvelopada: string
}

function chaveDaSenha(senha: string, sal: Buffer): Buffer {
  return scryptSync(senha.normalize('NFKC'), sal, TAM_CHAVE, { N: CUSTO })
}

/** Cifra em AES-256-GCM. O GCM autentica: um byte trocado no disco é detectado. */
export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(TAM_IV)
  const c = createCipheriv('aes-256-gcm', chave, iv)
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [
    MARCA,
    iv.toString('base64'),
    c.getAuthTag().toString('base64'),
    corpo.toString('base64')
  ].join('\n')
}

/**
 * Decifra. Lança quando a chave está errada ou o arquivo foi adulterado —
 * nunca devolve texto parcial ou lixo, que é a garantia do GCM.
 */
export function decifrar(blob: string, chave: Buffer): string {
  const linhas = blob.split('\n')
  if (linhas[0] !== MARCA || linhas.length < 4) throw new Error('arquivo cifrado malformado')
  const iv = Buffer.from(linhas[1], 'base64')
  const tag = Buffer.from(linhas[2], 'base64')
  const corpo = Buffer.from(linhas.slice(3).join('\n'), 'base64')
  if (iv.length !== TAM_IV) throw new Error('arquivo cifrado malformado')

  const d = createDecipheriv('aes-256-gcm', chave, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(corpo), d.final()]).toString('utf8')
}

export function estaCifrado(conteudo: string): boolean {
  return conteudo.startsWith(MARCA)
}

/** Sorteia a chave-mestra e a envelopa com a senha. Só na primeira vez. */
export function criarCofre(senha: string): { cofre: Cofre; chave: Buffer } {
  const chave = randomBytes(TAM_CHAVE)
  const sal = randomBytes(TAM_SAL)
  const cofre = {
    sal: sal.toString('hex'),
    chaveEnvelopada: cifrar(chave.toString('base64'), chaveDaSenha(senha, sal))
  }
  return { cofre, chave }
}

/** A chave-mestra, ou `null` se a senha não abre. Nunca lança por senha errada. */
export function abrirCofre(senha: string, cofre: Cofre): Buffer | null {
  let sal: Buffer
  try {
    sal = Buffer.from(cofre.sal, 'hex')
  } catch {
    return null
  }
  if (sal.length === 0) return null
  try {
    return Buffer.from(decifrar(cofre.chaveEnvelopada, chaveDaSenha(senha, sal)), 'base64')
  } catch {
    // Senha errada e arquivo adulterado dão o mesmo resultado aqui, de
    // propósito: distinguir os dois contaria a quem tenta adivinhar se ele
    // acertou o formato.
    return null
  }
}

/**
 * Reembrulha a chave-mestra com uma senha nova.
 *
 * É isto que faz trocar a senha custar uma escrita, e não milhares. Sal novo
 * junto: reusar o sal antigo com senha nova não é errado, mas trocar os dois
 * mantém uma regra só — cada envelope tem seu próprio sal.
 */
export function reenvelopar(chave: Buffer, novaSenha: string): Cofre {
  const sal = randomBytes(TAM_SAL)
  return {
    sal: sal.toString('hex'),
    chaveEnvelopada: cifrar(chave.toString('base64'), chaveDaSenha(novaSenha, sal))
  }
}
