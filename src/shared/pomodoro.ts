/**
 * As regras do pomodoro, sem tela.
 *
 * Moradia nova: estavam dentro do componente do desktop, e o celular passou a
 * precisar das mesmas — pedido dele, "tem que aparecer o pomodoro também no
 * mobile". Duplicar daria dois pomodoros que divergem na primeira mudança de
 * duração; aqui a regra é uma só, e cada tela desenha do seu jeito.
 *
 * O pomodoro é SEPARADO do cronômetro da sessão de estudo, também a pedido
 * dele: "o cronômetro não interfere no pomodoro, é uma ferramenta a mais que
 * eu vou utilizar separado".
 */

export type Fase = 'foco' | 'pausa' | 'pausa-longa'

/** Os 25/5/15 clássicos. */
export const DURACOES_PADRAO: Record<Fase, number> = { foco: 25, pausa: 5, 'pausa-longa': 15 }

/**
 * A próxima fase depois de uma.
 *
 * A cada quatro focos, a pausa é longa — é o ciclo original da técnica, e o
 * contador de focos é o que permite saber disso.
 */
export function proximaFase(fase: Fase, ciclos: number): { fase: Fase; ciclos: number } {
  if (fase !== 'foco') return { fase: 'foco', ciclos }
  const feitos = ciclos + 1
  return { fase: feitos % 4 === 0 ? 'pausa-longa' : 'pausa', ciclos: feitos }
}

/**
 * `mm:ss` a partir de milissegundos.
 *
 * Arredonda para CIMA: o relógio precisa mostrar 25:00 no instante em que
 * começa, e não 24:59, que parece que já perdeu um segundo.
 */
export function formatarRelogio(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** O nome da fase na tela. */
export function nomeDaFase(fase: Fase): string {
  return fase === 'foco' ? 'Foco' : fase === 'pausa' ? 'Pausa' : 'Pausa longa'
}
