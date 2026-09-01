import type { Guardado } from './guardado'

const CHAVE = 'cortex.vaultId'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * O id do vault é o que liga este celular a um Cortex.
 *
 * Ele é o `randomUUID()` que o desktop gerou. Validar o formato aqui evita a
 * pior falha possível deste app: o id colado torto, todo envio recusado pelo
 * banco, e a fila enchendo sem ninguém entender por quê.
 */
export function ehIdDeVault(v: string): boolean {
  return UUID.test(v.trim().toLowerCase())
}

export function lerVaultId(g: Guardado): string | null {
  const v = g.ler(CHAVE)
  // Um valor corrompido vale menos que nenhum: com `null` o app abre em
  // Ajustes pedindo o id, que é exatamente a tela certa para o caso.
  return v && ehIdDeVault(v) ? v.trim().toLowerCase() : null
}

export function gravarVaultId(g: Guardado, id: string): void {
  if (!ehIdDeVault(id)) throw new Error('id do vault inválido')
  g.gravar(CHAVE, id.trim().toLowerCase())
}

/**
 * O id que veio no fragmento do endereço, quando a câmera abriu o QR.
 *
 * Formato: `#id=<uuid>`. Fragmento, e não query, porque fragmento não é
 * enviado ao servidor — o id não entra em log de acesso nenhum.
 *
 * Devolve `null` para qualquer coisa que não seja um id válido; o fragmento
 * é entrada de fora como outra qualquer, e um link forjado não vai apontar
 * este celular para o vault de terceiro sem passar pela mesma validação.
 */
export function idDoFragmento(hash: string): string | null {
  const limpo = hash.startsWith('#') ? hash.slice(1) : hash
  const par = new URLSearchParams(limpo).get('id')
  return par && ehIdDeVault(par) ? par.trim().toLowerCase() : null
}
