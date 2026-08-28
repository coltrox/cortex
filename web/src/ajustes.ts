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
