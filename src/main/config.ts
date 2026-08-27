import { readFile, writeFile } from 'node:fs/promises'

/**
 * Configuração do vault — `.vault/config.json`.
 *
 * Fica dentro do vault, e não no userData do Electron, porque descreve *este*
 * vault: quais áreas o dono escolheu usar e quais pastas de código ele
 * autorizou a lente Dev a enxergar. Copiar a pasta do vault leva a
 * configuração junto.
 *
 * `pastasDev` é a lista de autorização explícita da lente Dev. O confinamento
 * do vault (`Vault.toAbsolute`) continua valendo para tudo que é nota; o Dev
 * usa um canal separado que só aceita raízes que estejam nesta lista. Nunca
 * afrouxe um para atender o outro.
 */
export type Config = {
  areas: string[]
  pastasDev: string[]
  /**
   * Se o dono do vault já passou pela tela de escolha de áreas.
   *
   * Existe porque "escolhi todas" e "nunca escolhi" produzem a mesma lista, e
   * sem este sinal a tela de abertura reapareceria para sempre — ou nunca
   * apareceria, dependendo do padrão que escolhêssemos para `areas`.
   */
  escolheu: boolean
}

/** Todas as lentes que o usuário pode ligar na abertura. `hoje` é sempre ligada. */
export const AREAS = [
  { id: 'vida', nome: 'Vida', descricao: 'Anotações, metas, compras, documentos e senhas' },
  { id: 'saude', nome: 'Saúde', descricao: 'Treinos, cardio, medidas, dieta e suplementos' },
  { id: 'dev', nome: 'Dev', descricao: 'Pastas de código, editor, terminal e notas de projeto' },
  { id: 'conhecimento', nome: 'Estudos', descricao: 'Conteúdos, provas, simulados, redações e livros' },
  { id: 'financas', nome: 'Grana', descricao: 'Transações, categorias e porquinho' },
  { id: 'calendario', nome: 'Agenda', descricao: 'Calendário mensal com tudo que tem data' }
] as const

export const IDS_AREAS: string[] = AREAS.map(a => a.id)

export const CONFIG_PADRAO: Config = { areas: [...IDS_AREAS], pastasDev: [], escolheu: false }

/**
 * Sanitiza o que veio do disco. Um `config.json` editado à mão, truncado por
 * queda de energia ou vindo de uma versão futura não pode derrubar a abertura
 * do vault: campo inválido cai no padrão, área desconhecida é descartada.
 */
export function normalizarConfig(bruto: unknown): Config {
  const o = (bruto ?? {}) as Record<string, unknown>
  const areas = Array.isArray(o.areas)
    ? o.areas.filter((a): a is string => typeof a === 'string' && IDS_AREAS.includes(a))
    : [...IDS_AREAS]
  const pastasDev = Array.isArray(o.pastasDev)
    ? [...new Set(o.pastasDev.filter((p): p is string => typeof p === 'string' && p.length > 0))]
    : []
  return { areas, pastasDev, escolheu: o.escolheu === true }
}

export async function lerConfig(caminho: string): Promise<Config> {
  try {
    return normalizarConfig(JSON.parse(await readFile(caminho, 'utf8')))
  } catch {
    // Ausente ou ilegível: o vault abre com tudo ligado. Não é erro — é o
    // estado de um vault que ainda não passou pela tela de abertura.
    return { ...CONFIG_PADRAO }
  }
}

export async function gravarConfig(caminho: string, c: Config): Promise<void> {
  await writeFile(caminho, `${JSON.stringify(c, null, 2)}\n`, 'utf8')
}
