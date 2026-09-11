/**
 * As pastas que dá para trancar sozinhas, sem trancar a área inteira.
 *
 * Trancar a Vida escondia junto as anotações, as metas e a lista de compras
 * — e quem quer senha em "Contas e senhas" quase nunca quer senha na lista de
 * compras. Estas entradas são o meio-termo: a mesma senha, a mesma cifra, um
 * pedaço menor.
 *
 * ## Por que o caminho da pasta é o identificador
 *
 * O que tranca de verdade é `Cofre.definirPastas`, que compara prefixo de
 * caminho. Um id inventado ("vida-contas") precisaria de uma tabela de
 * tradução em cada ponta, e a tradução é justamente onde as duas pontas
 * discordam com o tempo. Guardando o caminho, `paineisTrancados` continua
 * sendo uma lista de coisas que o cofre entende — umas são áreas, que viram
 * várias pastas, e outras já SÃO a pasta.
 *
 * Os dois vocabulários não colidem: id de área é minúsculo e sem barra
 * (`vida`), caminho de pasta começa com maiúscula e tem barra (`Vida/Contas`).
 *
 * ## Por que só estas
 *
 * São as pastas que existem em `PASTAS_POR_AREA` (main/config.ts) E têm uma
 * sub-aba que as mostra. Uma pasta sem sub-aba seria uma tranca invisível: o
 * conteúdo sumiria do painel sem um cadeado em lugar nenhum para abrir.
 */
export type SubArea = {
  /** O que vai em `paineisTrancados`. É o caminho real no vault. */
  pasta: string
  /** A área dona dela. Trancar a área inteira já cobre esta pasta. */
  area: string
  /**
   * As sub-abas que mostram o conteúdo desta pasta (ver renderer/subnav.ts).
   *
   * Mais de uma quando duas abas leem a mesma pasta: Treinos e Cardio moram
   * ambas em `Saude/Treinos`, e trancar a pasta tranca as duas. Dizer isso no
   * nome da entrada evita a surpresa de trancar "Treinos" e o Cardio sumir.
   */
  subs: string[]
  nome: string
}

export const SUBAREAS: SubArea[] = [
  { pasta: 'Vida/Contas', area: 'vida', subs: ['contas'], nome: 'Contas e senhas' },
  { pasta: 'Vida/Documentos', area: 'vida', subs: ['documentos'], nome: 'Documentos' },
  { pasta: 'Saude/Treinos', area: 'saude', subs: ['treinos', 'cardio'], nome: 'Treinos e cardio' },
  { pasta: 'Saude/Dieta', area: 'saude', subs: ['dieta'], nome: 'Dieta' },
  { pasta: 'Estudos/Conteudos', area: 'conhecimento', subs: ['conteudos'], nome: 'Conteúdos' },
  { pasta: 'Estudos/Provas', area: 'conhecimento', subs: ['provas'], nome: 'Provas' },
  { pasta: 'Estudos/Redacoes', area: 'conhecimento', subs: ['redacoes'], nome: 'Redações' },
  { pasta: 'Dev/Projetos', area: 'dev', subs: ['projetos', 'codigo'], nome: 'Projetos e código' },
  { pasta: 'Dev/Seguranca', area: 'dev', subs: ['seguranca'], nome: 'Segurança' }
]

/** Este texto é o caminho de uma sub-área trancável? */
export function ehSubArea(x: string): boolean {
  return SUBAREAS.some(s => s.pasta === x)
}

/** As sub-áreas de uma área, na ordem da tabela. */
export function subAreasDaArea(area: string): SubArea[] {
  return SUBAREAS.filter(s => s.area === area)
}

/** A sub-área que uma sub-aba mostra, se houver. */
export function subAreaDaAba(area: string, sub: string): SubArea | undefined {
  return SUBAREAS.find(s => s.area === area && s.subs.includes(sub))
}
