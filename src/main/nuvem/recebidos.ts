import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

/**
 * Quais eventos já viraram mudança no vault.
 *
 * Existe porque nem todo evento é idempotente: marcar o mesmo suplemento duas
 * vezes não muda nada (a lista é um conjunto), mas aplicar o mesmo gasto duas
 * vezes cobra duas vezes. E como o Cortex nunca escreve no banco — nem para
 * marcar como lido —, o controle tem que ser local.
 *
 * O arquivo é um mapa `id → data ISO em que foi aplicado`.
 */
export class Recebidos {
  private ids = new Map<string, string>()

  // Fila de gravação deste caminho: ver `gravar()`.
  private filaGravacao: Promise<void> = Promise.resolve()

  constructor(private readonly caminho: string) {}

  async carregar(): Promise<void> {
    try {
      const bruto = await readFile(this.caminho, 'utf8')
      const o = JSON.parse(bruto) as Record<string, unknown>
      this.ids = new Map(
        Object.entries(o).filter(([, v]) => typeof v === 'string') as [string, string][]
      )
    } catch (err) {
      // ENOENT é o caminho feliz: primeira sincronização, o arquivo ainda não
      // existe. JSON malformado (SyntaxError) também começa vazio — o custo é
      // reaplicar eventos que já estão no banco, chato mas recuperável.
      //
      // Qualquer OUTRO erro (EBUSY/EPERM do Windows, plausível bem no meio de
      // uma gravação concorrente, por exemplo) é diferente: não significa que
      // o arquivo está corrompido, só que não deu para lê-lo agora. Zerar a
      // memória aqui apagaria marcas que nunca estiveram corrompidas assim
      // que a próxima gravação persistir esse mapa vazio por cima. Por isso
      // propaga — quem chama tenta de novo depois, em vez de o Cortex decidir
      // sozinho que "não consegui ler" quer dizer "esqueça tudo".
      const codigo = (err as NodeJS.ErrnoException)?.code
      if (codigo === 'ENOENT' || err instanceof SyntaxError) {
        this.ids = new Map()
      } else {
        throw err
      }
    }
  }

  jaAplicado(id: string): boolean {
    return this.ids.has(id)
  }

  async marcar(id: string): Promise<void> {
    this.ids.set(id, new Date().toISOString())
    await this.gravar()
  }

  /**
   * Remove ids mais velhos que `diasMax`. Devolve quantos saíram.
   *
   * Data ilegível NÃO é removida — fica, mesmo sem nunca "vencer" sozinha.
   * O motivo é o custo dos dois erros: guardar um id a mais indevidamente
   * custa alguns bytes num JSON pequeno; esquecer um id indevidamente faz o
   * sincronizador reaplicar aquele evento e lançar o gasto de novo no vault.
   * Entre um desperdício de disco e um gasto em dobro, fica o desperdício.
   */
  async podar(diasMax: number): Promise<number> {
    const corte = Date.now() - diasMax * 86400000
    let removidos = 0
    for (const [id, quando] of this.ids) {
      const t = Date.parse(quando)
      if (!Number.isNaN(t) && t < corte) { this.ids.delete(id); removidos++ }
    }
    if (removidos > 0) await this.gravar()
    return removidos
  }

  /**
   * Serializa as gravações deste caminho. O plano dispara sincronização em
   * três gatilhos independentes — abrir o vault, timer de 2min, botão manual
   * — que podem se sobrepor. Sem fila, duas gravações concorrentes leem o
   * mapa em memória em momentos diferentes e escrevem snapshots diferentes; a
   * que termina por último apaga as marcas que a outra tinha acabado de
   * gravar. Mesmo defeito, mesmo remédio de `serializarPorCaminho` em
   * `src/main/ipc/handlers.ts`: a gravação N+1 só começa depois que a N
   * terminou (sucesso ou falha).
   */
  private gravar(): Promise<void> {
    const atual = this.filaGravacao.then(
      () => this.gravarAgora(),
      () => this.gravarAgora()
    )
    // Cópia silenciada como marcador de vez da fila — se guardássemos `atual`
    // diretamente, uma rejeição nesta gravação apareceria como "unhandled
    // rejection" pendurada aqui assim que mais ninguém estiver observando
    // esta promise específica (quem chamou já recebeu a rejeição de `atual`).
    this.filaGravacao = atual.then(() => undefined, () => undefined)
    return atual
  }

  /**
   * Grava em .tmp e renomeia: o recebidos.json nunca fica truncado nem
   * parcialmente escrito. `writeFile` direto no destino trunca antes de
   * escrever — se o processo morre no meio (queda de energia, kill, reboot
   * do Windows Update), o arquivo fica vazio ou com JSON quebrado, e
   * `carregar()` devolve mapa VAZIO, não parcial. Com a memória zerada, o
   * sincronizador reaplica todos os eventos da janela e os gastos entram em
   * dobro no vault — exatamente o defeito que esta classe existe para evitar.
   * Com .tmp + rename, uma queda deixa lixo `.tmp` órfão, mas o arquivo real
   * continua íntegro no último estado completo.
   *
   * Nome do temporário carrega `randomUUID()` além do `pid`, pelo mesmo
   * motivo do `Vault.writeAtomic`: único por CHAMADA, não por processo, para
   * que duas gravações concorrentes deste MESMO processo (se algum dia a
   * fila acima falhar ou for contornada) não colidam num `.pid.tmp`
   * compartilhado.
   */
  private async gravarAgora(): Promise<void> {
    const tmp = `${this.caminho}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(Object.fromEntries(this.ids), null, 2), 'utf8')
    try {
      await rename(tmp, this.caminho)
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
  }
}
