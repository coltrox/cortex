import { readFile, writeFile } from 'node:fs/promises'

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

  constructor(private readonly caminho: string) {}

  async carregar(): Promise<void> {
    try {
      const o = JSON.parse(await readFile(this.caminho, 'utf8')) as Record<string, unknown>
      this.ids = new Map(
        Object.entries(o).filter(([, v]) => typeof v === 'string') as [string, string][]
      )
    } catch {
      // Ausente ou corrompido: começa vazio. O custo é reaplicar eventos ainda
      // no banco — chato, mas melhor do que travar a sincronização para sempre.
      this.ids = new Map()
    }
  }

  jaAplicado(id: string): boolean {
    return this.ids.has(id)
  }

  async marcar(id: string): Promise<void> {
    this.ids.set(id, new Date().toISOString())
    await this.gravar()
  }

  /** Remove ids mais velhos que `diasMax`. Devolve quantos saíram. */
  async podar(diasMax: number): Promise<number> {
    const corte = Date.now() - diasMax * 86400000
    let removidos = 0
    for (const [id, quando] of this.ids) {
      const t = Date.parse(quando)
      if (Number.isNaN(t) || t < corte) { this.ids.delete(id); removidos++ }
    }
    if (removidos > 0) await this.gravar()
    return removidos
  }

  private async gravar(): Promise<void> {
    await writeFile(this.caminho, JSON.stringify(Object.fromEntries(this.ids), null, 2), 'utf8')
  }
}
