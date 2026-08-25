/**
 * Erro distinguível: a raiz do vault não existe (ou não é diretório) no
 * momento em que uma operação precisava dela. Nunca deve ser confundido com
 * uma falha genérica — o chamador precisa poder detectar este caso
 * especificamente para não reconstruir silenciosamente um vault que sumiu do
 * disco (spec §10: "não cria vault vazio por cima").
 *
 * Compartilhado entre `Session.open` e `Vault.writeAtomic`: ambos podem se
 * deparar com uma raiz de vault que sumiu depois que a sessão já estava
 * aberta (drive externo desmontado, pasta apagada/renomeada pelo usuário), e
 * ambos precisam lançar o mesmo tipo de erro para que os chamadores tenham
 * um único tipo para capturar.
 */
export class VaultRootMissingError extends Error {
  readonly code = 'VAULT_ROOT_MISSING'
  constructor(root: string) {
    super(`raiz do vault não existe ou não é um diretório: ${root}`)
    this.name = 'VaultRootMissingError'
  }
}
