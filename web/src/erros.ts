/**
 * Duas famílias de erro, porque a fila decide o destino do registro por elas.
 *
 * `ErroDeDado` é o que não adianta repetir: o banco recusou a forma do evento
 * e vai recusar de novo amanhã. O item sai da fila e vira aviso.
 *
 * `ErroDeRede` é o que o tempo resolve: sem sinal, servidor fora do ar, tempo
 * esgotado. O item fica.
 *
 * Qualquer erro que não seja nenhum dos dois conta como de rede. Errar para o
 * lado de guardar custa um item parado na fila; errar para o outro lado apaga
 * um registro que o Pedro fez.
 */
export class ErroDeDado extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeDado'
  }
}

export class ErroDeRede extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeRede'
  }
}
