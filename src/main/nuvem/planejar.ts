import type { Evento } from '../../shared/eventos'

/**
 * Traduz um evento vindo do celular nas mudanças que ele causa no vault.
 *
 * É puro de propósito: decidir "isto vira o quê" fica testável sem tocar em
 * disco, e o executor (`executar.ts`) fica fino demais para esconder defeito.
 */

export type Operacao =
  /** Acrescenta a um conjunto do diário (marcar suplemento, marcar refeição). */
  | { acao: 'diario-conjunto'; dia: string; campo: string; valor: string }
  /** Acrescenta a uma lista do diário (gasto, refeição extra). */
  | { acao: 'diario-lista'; dia: string; campo: string; item: Record<string, unknown> }
  /** Cria uma nota nova; se já existir, mescla o frontmatter. */
  | { acao: 'nota'; tipo: string; path: string; frontmatter: Record<string, unknown> }
  /** Cria a nota se faltar e mescla campos — usado por peso e medida. */
  | { acao: 'nota-campos'; tipo: string; path: string; campos: Record<string, unknown> }

/** Higieniza um título para virar nome de arquivo, igual ao renderer faz. */
const nomeArquivo = (s: string): string =>
  s.replace(/[/:*?"<>|\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** Copia só as chaves que têm valor — evita `pace: ""` sujando o frontmatter. */
function comValor(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}

export function planejar(evento: Evento): Operacao[] {
  const { tipo, dia, dados } = evento

  switch (tipo) {
    case 'suplemento': {
      const nome = txt(dados.nome)
      if (!nome) return []
      return [{ acao: 'diario-conjunto', dia, campo: 'suplementos_feitos', valor: nome }]
    }

    case 'refeicao_plano': {
      const nome = txt(dados.nome)
      if (!nome) return []
      return [{ acao: 'diario-conjunto', dia, campo: 'dieta_feitas', valor: nome }]
    }

    case 'refeicao_extra':
      return [{ acao: 'diario-lista', dia, campo: 'extras', item: comValor(dados) }]

    case 'gasto':
      // Só a string exata 'entrada' produz entrada; qualquer outra coisa
      // (ausente, com caixa diferente, lixo qualquer) vira saída — entre
      // errar o saldo do mês para mais ou para menos, menos é o lado seguro.
      // `dir` é escrito por último de propósito: espalhar `dados` primeiro e
      // sobrescrever `dir` depois é a única ordem em que ler a linha já diz
      // quem ganha — sobrescrever cedo deixaria um `dados.dir` cru vencer.
      return [{
        acao: 'diario-lista', dia, campo: 'transacoes',
        item: comValor({ ...dados, dir: txt(dados.dir) === 'entrada' ? 'entrada' : 'saida' })
      }]

    case 'sessao': {
      const modelo = txt(dados.modelo) || 'Treino livre'
      return [{
        acao: 'nota', tipo: 'sessao',
        path: `Saude/Treinos/${nomeArquivo(`${modelo} — ${dia}`)}.md`,
        frontmatter: comValor({ tipo: 'sessao', date: dia, ...dados, modelo })
      }]
    }

    case 'cardio':
      return [{
        acao: 'nota', tipo: 'cardio',
        path: `Saude/Treinos/cardio-${dia}.md`,
        frontmatter: comValor({ tipo: 'cardio', date: dia, ...dados })
      }]

    // Peso e medida escrevem na mesma nota de propósito: o botão de peso é um
    // atalho, não um dado paralelo, e o gráfico de peso lê um lugar só.
    case 'peso':
    case 'medida':
      return [{
        acao: 'nota-campos', tipo: 'medida',
        path: `Saude/medida-${dia}.md`,
        campos: comValor({ tipo: 'medida', date: dia, ...dados })
      }]

    case 'anotacao': {
      const texto = txt(dados.texto).trim()
      if (!texto) return []
      const titulo = texto.split(/\r\n|\n/)[0].slice(0, 60)
      return [{
        acao: 'nota', tipo: 'anotacao',
        path: `Vida/${nomeArquivo(titulo)}.md`,
        frontmatter: { tipo: 'anotacao', date: dia, titulo, texto }
      }]
    }

    default:
      // Um app mais novo mandando um tipo que este Cortex não conhece não
      // pode derrubar a sincronização inteira. Ignora e segue.
      return []
  }
}
