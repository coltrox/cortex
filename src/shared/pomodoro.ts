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

/** Quanto dura cada fase, em minutos. */
export type Duracoes = Record<Fase, number>

/** Os 25/5/15 clássicos. */
export const DURACOES_PADRAO: Duracoes = { foco: 25, pausa: 5, 'pausa-longa': 15 }

/**
 * Teto de uma fase, em minutos.
 *
 * Três horas é mais do que qualquer bloco de foco honesto, e o teto existe
 * para um dedo errado no celular não criar um pomodoro que nunca acaba.
 */
const MAIOR = 180

/**
 * Lê as durações que ele editou, caindo no padrão no que não servir.
 *
 * Pedido dele: "o pomodoro coloca opção de editar (para o Cortex mobile)".
 * O valor vem do armazenamento do navegador, que pode ter sido mexido à mão
 * ou ter sobrado de uma versão anterior — por isso cada campo é conferido
 * sozinho, em vez de descartar o conjunto inteiro por causa de um número
 * ruim.
 */
export function duracoesValidas(bruto: unknown): Duracoes {
  const obj = typeof bruto === 'object' && bruto !== null ? bruto as Record<string, unknown> : {}
  const campo = (fase: Fase): number => {
    const v = Number(obj[fase])
    if (!Number.isFinite(v)) return DURACOES_PADRAO[fase]
    /* Minuto inteiro: meio minuto no relógio confunde mais do que ajuda, e
       zero deixaria a fase acabar no instante em que começa. */
    return Math.min(MAIOR, Math.max(1, Math.round(v)))
  }
  return { foco: campo('foco'), pausa: campo('pausa'), 'pausa-longa': campo('pausa-longa') }
}

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
