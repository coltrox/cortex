import type { ItemCardapio } from '@compartilhado/eventos'
import { proximaOcorrencia, anosCompletados } from '@compartilhado/datas'
import type { Guardado } from './guardado'
import type { Cardapio } from './cardapio'

const CHAVE = 'cortex.edicoes-locais'
/** Dois dias: edição que o Cortex não devolveu até lá não pode ficar escondendo o vault para sempre. */
const VALIDADE_MS = 2 * 24 * 60 * 60 * 1000

/** Aviso interno para a tela redesenhar quando uma edição é guardada. */
export const EVENTO_EDICAO_LOCAL = 'cortex:edicao-local'

/**
 * Edições feitas aqui que o Cortex ainda não devolveu.
 *
 * Mesma ponte das outras (água, anotações, agenda, dinheiro): editar um
 * compromisso, uma data comemorativa ou uma anotação mostrava o valor ANTIGO
 * até a volta inteira pelo computador — e quem edita e continua vendo o
 * antigo edita de novo.
 *
 * A edição vale por cima do item publicado enquanto ele continuar IGUAL ao que
 * era no momento da edição (`antes`). Quando o publicado muda, o Cortex já
 * aplicou (ou alguém mexeu no computador) — e aí vale o vault, e a edição sai.
 */
type Edicao = { path: string; dados: Record<string, unknown>; antes: string; criadoEm: number }

const txt = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const pathDe = (i: ItemCardapio): string => (typeof i.detalhe.path === 'string' ? i.detalhe.path : '')
const assinatura = (i: ItemCardapio): string => JSON.stringify([i.especie, i.nome, i.detalhe])

function ler(g: Guardado): Edicao[] {
  const bruto = g.ler(CHAVE)
  if (!bruto) return []
  try {
    const cru = JSON.parse(bruto)
    if (!Array.isArray(cru)) return []
    // Vindo do localStorage: linha torta é linha descartada.
    return cru.filter(e =>
      e && typeof e.path === 'string' && e.dados && typeof e.dados === 'object' && !Array.isArray(e.dados) &&
      typeof e.antes === 'string' && typeof e.criadoEm === 'number') as Edicao[]
  } catch {
    return []
  }
}

const gravar = (g: Guardado, es: Edicao[]): void => g.gravar(CHAVE, JSON.stringify(es))

/**
 * Guarda a edição que acabou de sair na fila (os `dados` do evento
 * `compromisso_editado`). Duas edições seguidas no mesmo item se somam, e o
 * `antes` continua sendo o do publicado — é ele que diz quando o Cortex chegou.
 */
export function guardarEdicao(g: Guardado, cardapio: Cardapio, dados: Record<string, unknown>, agora = Date.now()): void {
  const path = txt(dados.path)
  if (!path) return
  const item = cardapio.itens.find(i => pathDe(i) === path)
  if (!item) return
  const edicoes = ler(g)
  const existente = edicoes.find(e => e.path === path)
  if (existente) {
    existente.dados = { ...existente.dados, ...dados }
    existente.criadoEm = agora
  } else {
    edicoes.push({ path, dados, antes: assinatura(item), criadoEm: agora })
  }
  gravar(g, edicoes)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_EDICAO_LOCAL))
}

/** O cardápio com as edições ainda a caminho por cima. Faz a faxina das que já chegaram. */
export function aplicarEdicoes(g: Guardado, cardapio: Cardapio, hoje: string, agora = Date.now()): Cardapio {
  const edicoes = ler(g)
  if (edicoes.length === 0) return cardapio
  const valem = edicoes.filter(e => {
    if (agora - e.criadoEm >= VALIDADE_MS) return false
    const item = cardapio.itens.find(i => pathDe(i) === e.path)
    return item !== undefined && assinatura(item) === e.antes
  })
  if (valem.length !== edicoes.length) gravar(g, valem)
  if (valem.length === 0) return cardapio
  return {
    ...cardapio,
    itens: cardapio.itens.map(i => {
      const e = valem.find(x => x.path === pathDe(i))
      return e ? aplicarEdicao(i, e.dados, hoje) : i
    })
  }
}

/** Um item publicado como ele fica depois da edição — cada espécie guarda o campo no seu lugar. */
export function aplicarEdicao(item: ItemCardapio, dados: Record<string, unknown>, hoje: string): ItemCardapio {
  const d: Record<string, unknown> = { ...item.detalhe }
  const nome = txt(dados.titulo) || item.nome
  const pondo = (chave: string, valor: unknown): void => { if (valor !== undefined) d[chave] = valor }
  const dias = Array.isArray(dados.dias) ? dados.dias.filter(x => typeof x === 'string') : undefined

  switch (item.especie) {
    case 'compromisso': {
      if (dados.comemorativa === true) {
        const data = txt(dados.data)
        if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
          const dia = Number(data.slice(8, 10))
          const mes = Number(data.slice(5, 7))
          d.dia = dia
          d.mes = mes
          const quando = proximaOcorrencia(dia, mes, hoje)
          if (quando) d.data = quando
        }
        if ('ano' in dados) {
          if (typeof dados.ano === 'number') d.ano = dados.ano
          else delete d.ano
        }
        const anos = typeof d.data === 'string' ? anosCompletados(d.ano, d.data) : null
        if (anos !== null && anos > 0) d.anos = anos
        else delete d.anos
        if ('oque' in dados) {
          if (typeof dados.oque === 'string') d.oque = dados.oque
          else delete d.oque
        }
        if ('quem' in dados) {
          if (typeof dados.quem === 'string' && dados.quem) d.quem = dados.quem
          else delete d.quem
        }
      } else {
        pondo('data', txt(dados.data))
        pondo('hora', txt(dados.hora))
        pondo('local', txt(dados.local))
      }
      break
    }
    case 'prova':
      pondo('data', txt(dados.data))
      pondo('materia', txt(dados.materia))
      pondo('local', txt(dados.local))
      break
    case 'tarefa':
      pondo('prazo', txt(dados.data))
      pondo('materia', txt(dados.materia))
      break
    case 'suplemento':
      pondo('dose', txt(dados.dose))
      pondo('quando', txt(dados.quando))
      pondo('dias', dias)
      break
    case 'rotina':
      pondo('quando', txt(dados.quando))
      pondo('dias', dias)
      pondo('corpo', txt(dados.texto))
      break
    case 'anotacao':
      pondo('texto', txt(dados.texto))
      break
  }
  return { ...item, nome, detalhe: d }
}
