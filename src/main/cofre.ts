import { cifrar, decifrar, estaCifrado } from './cifra'

/**
 * A chave-mestra enquanto o app está aberto, e quais pastas ela protege.
 *
 * Vive na memória do processo principal e some quando o app fecha — não há
 * "lembrar de mim". O renderer nunca a vê.
 *
 * `Vault` consulta este objeto em toda leitura e escrita. Ele é a única
 * costura entre "o painel está trancado" e "o arquivo está ilegível no
 * disco": o mesmo interruptor decide as duas coisas.
 */
export class Cofre {
  private chave: Buffer | null = null
  private pastas: string[] = []

  /** Guarda a chave-mestra. Chamado depois que a senha confere. */
  destrancar(chave: Buffer): void {
    this.chave = chave
  }

  /** Esquece a chave. Toda leitura de pasta protegida volta a falhar. */
  trancar(): void {
    this.chave = null
  }

  get destrancado(): boolean {
    return this.chave !== null
  }

  /**
   * As pastas cujo conteúdo fica cifrado.
   *
   * Vêm das áreas trancadas: painel trancado é painel cifrado. Guardadas com
   * barra no fim para a comparação não casar prefixo por acidente — `Vida`
   * não pode proteger `Vidateca`.
   */
  definirPastas(pastas: string[]): void {
    this.pastas = pastas.map(p => (p.endsWith('/') ? p : p + '/'))
  }

  /** Este caminho mora numa pasta protegida? */
  protege(rel: string): boolean {
    const limpo = rel.split(String.fromCharCode(92)).join('/')
    return this.pastas.some(p => limpo.startsWith(p))
  }

  /**
   * O que gravar no disco.
   *
   * Fora de pasta protegida, ou sem cifra ligada, devolve o texto como veio.
   * Dentro de pasta protegida com o cofre TRANCADO, lança: gravar texto puro
   * ali seria decifrar o vault sem que ninguém pedisse, e em silêncio.
   */
  paraGravar(rel: string, conteudo: string): string {
    if (!this.protege(rel)) return conteudo
    if (!this.chave) {
      throw new Error(
        '"' + rel + '" está numa pasta trancada e o cofre não foi aberto — ' +
        'digite a senha do painel antes de gravar'
      )
    }
    return cifrar(conteudo, this.chave)
  }

  /**
   * O que devolver de uma leitura.
   *
   * Decide pelo CONTEÚDO, não pelo caminho: durante a conversão de uma pasta,
   * e logo depois de destrancar um painel, convivem no mesmo diretório
   * arquivos cifrados e arquivos ainda em texto. Olhar o caminho faria a
   * função tentar decifrar markdown comum e falhar por nada.
   */
  paraLer(conteudo: string): string {
    if (!estaCifrado(conteudo)) return conteudo
    if (!this.chave) throw new ErroTrancado()
    return decifrar(conteudo, this.chave)
  }
}

/**
 * Leitura de arquivo cifrado com o cofre fechado.
 *
 * Tem tipo próprio porque quem chama precisa distinguir isto de um erro de
 * disco: o indexador PULA um arquivo trancado e segue (o vault continua
 * abrindo com o painel fechado), mas não pode engolir um disco com defeito
 * do mesmo jeito.
 */
export class ErroTrancado extends Error {
  constructor() {
    super('arquivo trancado: digite a senha do painel para abrir')
    this.name = 'ErroTrancado'
  }
}
