import type { Guardado } from './guardado'

const CHAVE = 'cortex.medidas'

/**
 * O peso e as medidas que este aparelho registrou e o Cortex ainda não
 * devolveu.
 *
 * Mesma ponte da água (`agua.ts`) e das anotações (`anotacoes.ts`), pelo mesmo
 * motivo: entre tocar em Salvar e o número aparecer no gráfico existe a volta
 * inteira — fila, Supabase, campainha, o Cortex escrevendo a nota e
 * republicando o cardápio. Com o computador desligado essa volta demora o dia
 * inteiro, e sem esta ponte a tela ficava idêntica ao que era antes do toque.
 * Quem registra conclui que não salvou, e registra de novo.
 *
 * Não é uma segunda verdade: a verdade é a nota no vault. Isto é só a
 * distância entre o que foi tocado e o que o vault já sabe — e ela se fecha
 * sozinha, porque `conciliarMedidas` apaga daqui tudo que voltar publicado.
 *
 * Guarda um dia só. O pendente de ontem não tem para onde ir, e um mapa que
 * cresce para sempre é a maneira de estourar o `localStorage` sem perceber.
 */
export type MedidasLocais = Record<string, number>

function ler(g: Guardado, dia: string): MedidasLocais {
  const bruto = g.ler(CHAVE)
  if (!bruto) return {}
  try {
    const cru = JSON.parse(bruto)
    if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return {}
    const doDia = (cru as Record<string, unknown>)[dia]
    if (!doDia || typeof doDia !== 'object' || Array.isArray(doDia)) return {}
    const out: MedidasLocais = {}
    // Vindo do `localStorage`, que qualquer script da página pode escrever:
    // campo torto é campo descartado, e não a tela inteira quebrada.
    for (const [k, v] of Object.entries(doDia as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export const lerMedidasLocais = ler

/**
 * Guarda o que acabou de ser registrado, por cima do que já estava.
 *
 * Por cima, e não somando: medida é um valor, não um movimento. Corrigir a
 * cintura de 71 para 70 tem que deixar 70, e não 141 — é o oposto da água,
 * onde cada toque acrescenta.
 */
export function guardarMedidasLocais(
  g: Guardado, dia: string, campos: MedidasLocais
): MedidasLocais {
  const novo = { ...ler(g, dia) }
  for (const [k, v] of Object.entries(campos)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) novo[k] = v
  }
  // Só o dia informado sobrevive à gravação — é a poda dos dias antigos.
  g.gravar(CHAVE, JSON.stringify({ [dia]: novo }))
  return novo
}

/**
 * Chegou cardápio novo: sai daqui o que o Cortex já absorveu.
 *
 * Compara valor a valor, e não "veio alguma medida de hoje": o Cortex pode ter
 * recebido o peso e ainda não a cintura, e apagar as duas de uma vez faria a
 * cintura sumir da tela antes de existir no vault.
 *
 * A comparação tolera diferença mínima porque o número faz uma volta por JSON
 * e por YAML, e 62,4 pode voltar como 62,400000000000006.
 */
export function conciliarMedidas(
  g: Guardado, dia: string, doCardapio: MedidasLocais
): MedidasLocais {
  const atuais = ler(g, dia)
  const restam: MedidasLocais = {}
  for (const [k, v] of Object.entries(atuais)) {
    const confirmado = doCardapio[k]
    if (typeof confirmado === 'number' && Math.abs(confirmado - v) < 0.01) continue
    restam[k] = v
  }
  g.gravar(CHAVE, JSON.stringify({ [dia]: restam }))
  return restam
}
