/**
 * Quais lentes aparecem na barra lateral, a partir das áreas ligadas.
 *
 * `cerebro` e `hoje` não são áreas — não se ligam nem se desligam na
 * abertura —, e por isso vinham sempre. Só que quem liga **apenas a área
 * Dev** quer um editor, não um app de vida: o Hoje aparecia vazio, com
 * treino, dieta e agenda de ninguém.
 *
 * Então, nesse caso e só nesse, o Cortex vira um app de Dev: ficam a Rede
 * neural (que desenha o vault inteiro) e o Dev. Pedido do dono em
 * 23/09/2026: "se a pessoa escolher acompanhar so a area dev, o cortex vai
 * servir apenas de dev, tira o hoje, dev e rede neural apenas".
 */

/** Só a área Dev ligada — qualquer outra área traz o Hoje de volta. */
export const soDeDev = (areas: string[]): boolean =>
  areas.length === 1 && areas[0] === 'dev'

export function lentesVisiveis<T extends { id: string }>(lentes: T[], areas: string[]): T[] {
  if (soDeDev(areas)) return lentes.filter(l => l.id === 'cerebro' || l.id === 'dev')
  return lentes.filter(l => l.id === 'hoje' || l.id === 'cerebro' || areas.includes(l.id))
}

/**
 * A lente que deve estar na tela.
 *
 * Continua na atual enquanto ela existir. Sumiu (a pessoa desligou a área),
 * vai para a primeira útil — no app só de Dev, o Dev, e não a Rede neural:
 * quem escolheu só Dev quer abrir no editor.
 */
export function lenteDeAbertura<T extends { id: string }>(
  visiveis: T[], atual: string, areas: string[]
): T | undefined {
  const aqui = visiveis.find(l => l.id === atual)
  if (aqui) return aqui
  if (soDeDev(areas)) return visiveis.find(l => l.id === 'dev') ?? visiveis[0]
  return visiveis[0]
}
