import type { Guardado } from './guardado'
import { proximaOcorrencia, anosCompletados, anoDeOrigem } from '@compartilhado/datas'

const CHAVE = 'cortex.agenda-pendente'

/**
 * O que este aparelho marcou na agenda e o Cortex ainda não devolveu.
 *
 * Mesma ponte da água, das anotações e das medidas, e pelo mesmo motivo — mas
 * aqui a falta dela doía mais. Marcar um compromisso levava a pessoa de volta
 * à lista, e a lista continuava exatamente como antes: o item só aparece
 * depois da volta inteira (fila, Supabase, campainha, o Cortex escrevendo a
 * nota, republicando o cardápio, e o celular buscando de novo). Com o
 * computador desligado, isso é o dia seguinte.
 *
 * Quem marca e não vê, marca de novo. Era esse o "às vezes não vai".
 *
 * Não é uma segunda agenda: a verdade é a nota no vault. Isto é só a distância
 * entre o toque e o vault saber — e ela se fecha sozinha, porque
 * `conciliarAgenda` apaga daqui tudo que voltar publicado.
 *
 * Guarda um dia só, como as outras pontes. Um item marcado ontem e ainda não
 * devolvido some da tela na virada — o evento continua na fila e chega do
 * mesmo jeito, mas a tela deixa de mostrá-lo antes da hora. É o preço de não
 * deixar um mapa crescer para sempre no armazenamento do navegador.
 */
export type PendenteAgenda = {
  tipo: 'prova' | 'compromisso' | 'tarefa'
  titulo: string
  /** ISO `AAAA-MM-DD`: o dia do compromisso, não o dia em que foi marcado. */
  data: string
  hora?: string
  local?: string
  materia?: string
  /** Data comemorativa: sobe como compromisso, e a tela mostra diferente. */
  comemorativa?: boolean
  /** Data comemorativa: quantos anos vai fazer na próxima vez que cair. */
  anos?: number
}

/**
 * O pendente de uma data comemorativa, com a data da PRÓXIMA vez que ela cai.
 *
 * O campo do celular traz a data de quando começou — 1990-03-05 para um
 * aniversário. Guardar isso cru era o "não está registrando": o evento subia,
 * mas a aba Chegando esconde o que já passou, e 1990 passou. O item sumia no
 * mesmo toque que devia mostrá-lo. E nunca saía daqui, porque o Cortex
 * devolve a próxima ocorrência (2027-03-05) e a conciliação casa por data.
 *
 * Por isso a conta é a mesma dos dois lados: `proximaOcorrencia` é a de
 * `montarCardapio`, e o ano só vale se for anterior ao corrente, como no
 * planejador — o seletor de data traz o ano atual por padrão.
 */
export function pendenteComemorativo(
  titulo: string, data: string, hoje: string
): PendenteAgenda | null {
  const [ano, mes, dia] = data.split('-').map(Number)
  const quando = proximaOcorrencia(dia, mes, hoje)
  if (!quando) return null
  const anos = anosCompletados(anoDeOrigem(ano, hoje), quando)
  return {
    tipo: 'compromisso',
    titulo: titulo.trim(),
    data: quando,
    comemorativa: true,
    anos: anos !== null && anos > 0 ? anos : undefined
  }
}

const TIPOS = ['prova', 'compromisso', 'tarefa'] as const

function ler(g: Guardado, dia: string): PendenteAgenda[] {
  const bruto = g.ler(CHAVE)
  if (!bruto) return []
  try {
    const cru = JSON.parse(bruto)
    if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return []
    const lista = (cru as Record<string, unknown>)[dia]
    if (!Array.isArray(lista)) return []

    const out: PendenteAgenda[] = []
    for (const item of lista) {
      // Vindo do `localStorage`, que qualquer script da página pode escrever:
      // linha torta é linha descartada, e não a tela inteira quebrada.
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const tipo = TIPOS.find(t => t === o.tipo)
      if (!tipo) continue
      if (typeof o.titulo !== 'string' || o.titulo === '') continue
      if (typeof o.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.data)) continue
      out.push({
        tipo,
        titulo: o.titulo,
        data: o.data,
        hora: typeof o.hora === 'string' && o.hora !== '' ? o.hora : undefined,
        local: typeof o.local === 'string' && o.local !== '' ? o.local : undefined,
        materia: typeof o.materia === 'string' && o.materia !== '' ? o.materia : undefined,
        comemorativa: o.comemorativa === true ? true : undefined,
        anos: typeof o.anos === 'number' && Number.isInteger(o.anos) && o.anos > 0
          ? o.anos
          : undefined
      })
    }
    return out
  } catch {
    return []
  }
}

export const lerPendentesAgenda = ler

/** Guarda o que acabou de ser marcado. */
export function guardarPendenteAgenda(
  g: Guardado, dia: string, item: PendenteAgenda
): PendenteAgenda[] {
  const nova = [...ler(g, dia), item]
  // Só o dia informado sobrevive à gravação — é a poda dos dias antigos.
  g.gravar(CHAVE, JSON.stringify({ [dia]: nova }))
  return nova
}

/**
 * Chegou cardápio novo: sai daqui o que o Cortex já devolveu.
 *
 * Casa por tipo, título e data. Não por caminho, porque o pendente ainda não
 * tem um — ele nasce quando o Cortex cria o arquivo, e é justamente isso que
 * estamos esperando acontecer.
 *
 * Dois compromissos idênticos no mesmo dia, marcados de propósito, colapsam em
 * um. É um empate raro e o erro barato: o segundo aparece assim que o cardápio
 * voltar com os dois.
 */
export function conciliarAgenda(
  g: Guardado,
  dia: string,
  publicados: { tipo: string; titulo: string; data: string }[]
): PendenteAgenda[] {
  const jaTem = new Set(publicados.map(p => `${p.tipo}|${p.titulo.trim()}|${p.data}`))
  const restam = ler(g, dia).filter(p => !jaTem.has(`${p.tipo}|${p.titulo.trim()}|${p.data}`))
  g.gravar(CHAVE, JSON.stringify({ [dia]: restam }))
  return restam
}
