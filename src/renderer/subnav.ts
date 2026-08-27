import type { Lente } from './useVault'

/**
 * Sub-navegação de cada lente.
 *
 * A primeira sub é sempre o panorama; o resto detalha. `Hoje` e `Agenda` não
 * têm sub — são uma tela só.
 */
export type Sub = string

export const SUBS: Partial<Record<Lente, { id: Sub; nome: string }[]>> = {
  vida: [
    { id: 'overview',    nome: 'Panorama' },
    { id: 'anotacoes',   nome: 'Anotações' },
    { id: 'metas',       nome: 'Metas' },
    { id: 'compras',     nome: 'Comprar' },
    { id: 'contas',      nome: 'Contas e senhas' },
    { id: 'pessoas',     nome: 'Pessoas' },
    { id: 'documentos',  nome: 'Documentos' }
  ],
  saude: [
    { id: 'overview',    nome: 'Panorama' },
    { id: 'treinos',     nome: 'Treinos' },
    { id: 'cardio',      nome: 'Cardio' },
    { id: 'medidas',     nome: 'Medidas' },
    { id: 'dieta',       nome: 'Dieta' },
    { id: 'suplementos', nome: 'Suplementos' }
  ],
  conhecimento: [
    { id: 'overview',    nome: 'Panorama' },
    { id: 'conteudos',   nome: 'Conteúdos' },
    { id: 'provas',      nome: 'Provas' },
    { id: 'simulados',   nome: 'Simulados' },
    { id: 'redacoes',    nome: 'Redações' },
    { id: 'tarefas',     nome: 'Tarefas' },
    { id: 'livros',      nome: 'Livros' }
  ],
  financas: [
    { id: 'overview',    nome: 'Panorama' },
    { id: 'transacoes',  nome: 'Transações' },
    { id: 'porquinho',   nome: 'Porquinho' }
  ],
  dev: [
    { id: 'projetos',    nome: 'Projetos' },
    { id: 'codigo',      nome: 'Código' },
    { id: 'seguranca',   nome: 'Segurança' }
  ]
}

export function subPadrao(lente: Lente): Sub {
  return SUBS[lente]?.[0]?.id ?? 'overview'
}

/**
 * Dias entre hoje e uma data ISO. Negativo é passado.
 * Comparação em UTC a partir dos componentes da data — sem hora, sem fuso.
 */
export function diasAte(data: string, hoje: string): number {
  const [a1, m1, d1] = data.split('-').map(Number)
  const [a2, m2, d2] = hoje.split('-').map(Number)
  const ms = Date.UTC(a1, m1 - 1, d1) - Date.UTC(a2, m2 - 1, d2)
  return Math.round(ms / 86400000)
}

/**
 * Urgência de um prazo, para colorir o contador.
 *
 * `feito` sempre devolve 'ok' — marcar como concluído (ou como matéria
 * revisada) tira o alerta, que é o comportamento que o alerta existe para
 * provocar.
 */
export function urgencia(dias: number, feito: boolean): 'ok' | 'longe' | 'perto' | 'agora' | 'passou' {
  if (feito) return 'ok'
  if (dias < 0) return 'passou'
  if (dias <= 2) return 'agora'
  if (dias <= 7) return 'perto'
  return 'longe'
}

export function rotuloPrazo(dias: number): string {
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  if (dias < 0) return `há ${-dias} dias`
  return `em ${dias} dias`
}
