/**
 * A camada fina sobre o `localStorage`.
 *
 * Existe por dois motivos. O primeiro é teste: os módulos que guardam estado
 * recebem um `Guardado` e por isso rodam no vitest com `environment: node`,
 * sem jsdom e sem nenhuma dependência nova. O segundo é que o `localStorage`
 * de verdade **lança** — em janela anônima, com cota estourada, ou quando o
 * navegador está configurado para bloquear dado de site. Um app de captura
 * que quebra a tela inteira porque não conseguiu guardar uma preferência é
 * pior do que um que segue sem lembrar.
 */
export interface Guardado {
  ler(chave: string): string | null
  gravar(chave: string, valor: string): void
  apagar(chave: string): void
}

export const guardadoDoNavegador: Guardado = {
  ler(chave) {
    try {
      return localStorage.getItem(chave)
    } catch {
      return null
    }
  },
  gravar(chave, valor) {
    try {
      localStorage.setItem(chave, valor)
    } catch {
      // Sem espaço ou sem permissão. Quem chama não tem o que fazer a
      // respeito, e a fila sobrevive a perder a persistência: ela continua
      // na memória enquanto a aba estiver aberta.
    }
  },
  apagar(chave) {
    try {
      localStorage.removeItem(chave)
    } catch {
      // idem
    }
  }
}

/** O dublê dos testes — e nada além disso. */
export function guardadoDeMemoria(inicial: Record<string, string> = {}): Guardado {
  const mapa = new Map(Object.entries(inicial))
  return {
    ler: c => (mapa.has(c) ? (mapa.get(c) as string) : null),
    gravar: (c, v) => void mapa.set(c, v),
    apagar: c => void mapa.delete(c)
  }
}
