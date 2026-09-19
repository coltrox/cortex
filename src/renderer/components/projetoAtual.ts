/** O que a árvore do Dev sabe de cada pasta já lida, pela pasta ('' é a raiz). */
export type Listagem = Record<string, { nome: string; pasta: boolean }[]>

/** O último item clicado na árvore. */
export type Foco = { rel: string; pasta: boolean } | null

const pai = (rel: string): string => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

/**
 * Onde a pessoa estava no Dev: a pasta aberta (`raiz`), o projeto em que
 * entrou (`base`), as pastas expandidas e o arquivo aberto. Guardado nas
 * preferências do computador para voltar ao mesmo lugar depois de trocar de
 * área ou reabrir o Cortex.
 */
export type EstadoDev = {
  raiz: string
  base: string
  abertas: string[]
  arquivo: string | null
  /** As abas de projetos abertos ao lado da pasta (pedido do dono: navegar e rodar mais de um). */
  abertos: ProjetoAberto[]
}

/** Uma aba de projeto: a pasta aberta e o projeto dentro dela. */
export type ProjetoAberto = { raiz: string; base: string }

/** O caminho do jeito que o Windows compara: barra invertida, sem caixa, sem barra no fim. */
const normal = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/**
 * O processo roda neste projeto (na pasta dele, ou numa de dentro)? É o que
 * acende a bolinha verde na aba. Criar um projeto roda na pasta de fora e não
 * conta para nenhuma aba.
 */
export function processoEhDoProjeto(cwd: string, raiz: string, base: string): boolean {
  if (!base) return false
  const alvo = normal(`${raiz}\\${base}`)
  const c = normal(cwd)
  return c === alvo || c.startsWith(alvo + '\\')
}

/** Lê o que foi guardado, desconfiando: formato estranho vira padrão, sem raiz não restaura nada. */
export function lerEstadoDev(texto: string | undefined): EstadoDev | null {
  if (!texto) return null
  try {
    const o = JSON.parse(texto) as Record<string, unknown>
    if (!o || typeof o.raiz !== 'string' || !o.raiz) return null
    return {
      raiz: o.raiz,
      base: typeof o.base === 'string' ? o.base : '',
      abertas: Array.isArray(o.abertas) ? o.abertas.filter((a): a is string => typeof a === 'string') : [],
      arquivo: typeof o.arquivo === 'string' && o.arquivo ? o.arquivo : null,
      abertos: Array.isArray(o.abertos)
        ? o.abertos.filter((a): a is ProjetoAberto =>
          !!a && typeof a === 'object' &&
          typeof (a as ProjetoAberto).raiz === 'string' && typeof (a as ProjetoAberto).base === 'string' &&
          !!(a as ProjetoAberto).base)
          .map(a => ({ raiz: a.raiz, base: a.base }))
        : []
    }
  } catch {
    return null
  }
}

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
