/** O que a árvore do Dev sabe de cada pasta já lida, pela pasta ('' é a raiz). */
export type Listagem = Record<string, { nome: string; pasta: boolean }[]>

/** O último item clicado na árvore. */
export type Foco = { rel: string; pasta: boolean } | null

const pai = (rel: string): string => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

/**
 * A pasta do projeto em que a pessoa está, relativa à pasta autorizada.
 *
 * É dela que saem os scripts (npm run dev), o terminal e o VS Code. A pasta
 * autorizada muitas vezes é `projetos`, com vários projetos dentro: rodar na
 * raiz dela não acharia package.json nenhum. Então sobe de quem está em foco
 * até o package.json mais perto. Sem nenhum (projeto Python, pasta ainda não
 * lida), fica na pasta de primeiro nível, que é o projeto dentro de
 * `projetos`. Se a própria raiz tem package.json, a raiz vence as subpastas
 * sem um.
 */
export function projetoDoFoco(foco: Foco, filhos: Listagem): string {
  if (!foco) return ''
  const inicio = foco.pasta ? foco.rel : pai(foco.rel)
  for (let dir = inicio; ; dir = pai(dir)) {
    if (filhos[dir]?.some(e => !e.pasta && e.nome === 'package.json')) return dir
    if (dir === '') break
  }
  return inicio.split('/')[0] ?? ''
}
