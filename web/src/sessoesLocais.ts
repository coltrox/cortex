import type { Guardado } from './guardado'
import type { SessaoFeita } from './cardapio'

const CHAVE = 'cortex.sessoes-locais'

/**
 * O treino registrado aqui, enquanto o Cortex não o devolve.
 *
 * Entre apertar "registrar" e o treino aparecer no histórico há a volta
 * inteira: fila → Supabase → campainha → o Cortex acorda, escreve a nota e
 * republica o cardápio. Com o computador desligado — o normal na academia —
 * isso é no dia seguinte, e até lá o histórico mostrava o treino de ontem
 * como se o de hoje não tivesse acontecido.
 *
 * Mesma ideia das marcas de `feitos` e do pendente da água: é memória da
 * tela, não dado. A verdade continua sendo o vault, e cada sessão sai daqui
 * assim que o cardápio traz a dela.
 */
type Guardadas = { sessoes: SessaoFeita[] }

function ler(g: Guardado): SessaoFeita[] {
  const bruto = g.ler(CHAVE)
  if (!bruto) return []
  try {
    const cru = JSON.parse(bruto) as Guardadas
    return cru && Array.isArray(cru.sessoes) ? cru.sessoes.filter(s => s && typeof s.data === 'string') : []
  } catch {
    return []
  }
}

const mesma = (a: SessaoFeita, b: SessaoFeita): boolean =>
  a.data === b.data && a.modelo === b.modelo

/** Guarda (ou substitui) a sessão registrada agora. */
export function guardarSessaoLocal(g: Guardado, s: SessaoFeita): void {
  const sessoes = [s, ...ler(g).filter(x => !mesma(x, s))].slice(0, 20)
  g.gravar(CHAVE, JSON.stringify({ sessoes }))
}

/**
 * As sessões para a tela: as do Cortex mais as daqui que ele ainda não tem.
 *
 * Quando a do Cortex chega, ela manda — pode ter sido corrigida no
 * computador, e o que está no vault é o que vale.
 */
export function sessoesComLocais(doCardapio: SessaoFeita[], locais: SessaoFeita[]): SessaoFeita[] {
  const faltando = locais.filter(l => !doCardapio.some(c => mesma(c, l)))
  return [...doCardapio, ...faltando].sort((a, b) => b.data.localeCompare(a.data))
}

/**
 * Tira da memória local o que o Cortex já publicou.
 *
 * Cardápio sem nenhuma sessão não confirma nada: é o que a tela tem antes de
 * ele carregar, e limpar ali apagaria da tela o treino recém-registrado.
 * Devolve se mexeu, para a tela só reler quando precisar.
 */
export function conciliarSessoes(g: Guardado, doCardapio: SessaoFeita[]): boolean {
  if (doCardapio.length === 0) return false
  const atuais = ler(g)
  const resta = atuais.filter(l => !doCardapio.some(c => mesma(c, l)))
  if (resta.length === atuais.length) return false
  g.gravar(CHAVE, JSON.stringify({ sessoes: resta }))
  return true
}

export function sessoesLocais(g: Guardado): SessaoFeita[] {
  return ler(g)
}
