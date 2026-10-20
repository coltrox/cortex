import { txt, num } from './util'

/**
 * A nota da sessão de estudos.
 *
 * O pedido: "eu quero que você marque depois sessão de estudos tal de tal
 * dia, de tal horário, e quantos exercícios de cada matéria eu acertei,
 * quantos que eu errei, os conteúdos que eu mais fui bem, os que eu mais fui
 * mal".
 *
 * O celular manda os números já somados — ele é quem viu as respostas. Aqui
 * se decide o FORMATO: o nome do arquivo, o frontmatter e o texto. É
 * deliberado que a formatação viva no Cortex e não no telefone, por dois
 * motivos: o vault é daqui, e mudar o jeito da nota não pode depender de o
 * aparelho ter atualizado o app.
 *
 * Tudo que chega é tratado como suspeito. O payload vem da internet, e um
 * número torto viraria uma nota com "NaN acertos" ou um caminho de arquivo
 * fora da pasta de estudos.
 */

export type PlacarSessao = {
  nome: string
  certas: number
  erradas: number
}

export type SessaoNormalizada = {
  dia: string
  /** `14h30`, para o título e o nome do arquivo. */
  inicio: string
  fim: string
  minutos: number
  materias: PlacarSessao[]
  conteudos: PlacarSessao[]
}

/** Quantas questões um assunto precisa ter para entrar no "fui bem"/"fui mal". */
export const MINIMO_PARA_DESTAQUE = 3

/** Teto de linhas por tabela: uma sessão não gera relatório de dez páginas. */
const TETO_LINHAS = 20

/** `2026-10-20T14:30` → `14h30`. Sem hora, string vazia. */
function hora(marca: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(marca)
    ? marca.slice(11, 16).replace(':', 'h')
    : ''
}

/** `2026-10-20` → `20/10`. */
function diaCurto(dia: string): string {
  const [, mes, d] = dia.split('-')
  return mes && d ? `${d}/${mes}` : dia
}

function placares(bruto: unknown): PlacarSessao[] {
  if (!Array.isArray(bruto)) return []
  const out: PlacarSessao[] = []
  for (const cru of bruto) {
    if (!cru || typeof cru !== 'object') continue
    const p = cru as Record<string, unknown>
    const nome = txt(p.nome).trim()
    const certas = num(p.certas)
    const erradas = num(p.erradas)
    if (!nome) continue
    // Contagem negativa ou quebrada não existe: é dado corrompido, e somá-la
    // daria um aproveitamento sem sentido no relatório.
    const c = certas !== undefined && certas >= 0 ? Math.round(certas) : 0
    const e = erradas !== undefined && erradas >= 0 ? Math.round(erradas) : 0
    if (c + e === 0) continue
    out.push({ nome: nome.slice(0, 120), certas: c, erradas: e })
    if (out.length >= TETO_LINHAS) break
  }
  return out
}

const total = (p: PlacarSessao): number => p.certas + p.erradas
const taxa = (p: PlacarSessao): number => (total(p) > 0 ? p.certas / total(p) : 0)
const pct = (p: PlacarSessao): number => Math.round(taxa(p) * 100)

/**
 * Valida o payload do celular.
 *
 * Devolve `null` quando a sessão não tem o essencial — dia, horário e ao
 * menos uma questão respondida. Uma sessão sem resposta nenhuma não é
 * relatório: é o botão de encerrar tocado por engano, e criar nota para isso
 * encheria o vault de arquivos vazios.
 */
export function normalizarSessao(dados: Record<string, unknown>): SessaoNormalizada | null {
  const inicio = txt(dados.inicio)
  const dia = inicio.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null

  const hInicio = hora(inicio)
  if (!hInicio) return null

  const materias = placares(dados.materias)
  const conteudos = placares(dados.conteudos)
  if (materias.length === 0 && conteudos.length === 0) return null

  const min = num(dados.minutos)
  // Doze horas seguidas de treino é app com defeito, não estudo — o mesmo
  // teto que o evento `estudo` já usa.
  const minutos = min !== undefined && min > 0 && min <= 720 ? Math.round(min) : 0

  return {
    dia,
    inicio: hInicio,
    fim: hora(txt(dados.fim)),
    minutos,
    materias,
    conteudos
  }
}

/**
 * Onde ele foi bem e onde foi mal.
 *
 * O piso de questões é o que impede "acertei a única questão de física" de
 * virar a melhor matéria do dia. E quando tudo tem o mesmo aproveitamento não
 * há destaque: apontar os dois lados da mesma lista seria ruído.
 */
export function destaques(ps: PlacarSessao[]): { bem: PlacarSessao[]; mal: PlacarSessao[] } {
  const elegiveis = ps.filter(p => total(p) >= MINIMO_PARA_DESTAQUE)
  if (elegiveis.length === 0) return { bem: [], mal: [] }
  const melhor = Math.max(...elegiveis.map(taxa))
  const pior = Math.min(...elegiveis.map(taxa))
  if (melhor === pior) return { bem: [], mal: [] }
  return {
    bem: elegiveis.filter(p => taxa(p) === melhor),
    mal: elegiveis.filter(p => taxa(p) === pior)
  }
}

/** Pior aproveitamento primeiro: é o que ele precisa estudar amanhã. */
function ordenado(ps: PlacarSessao[]): PlacarSessao[] {
  return [...ps].sort((a, b) =>
    taxa(a) - taxa(b) || total(b) - total(a) || a.nome.localeCompare(b.nome, 'pt-BR')
  )
}

function tabela(titulo: string, coluna: string, ps: PlacarSessao[]): string[] {
  if (ps.length === 0) return []
  const linhas = [
    `## ${titulo}`,
    '',
    `| ${coluna} | acertei | errei | aproveitamento |`,
    '|---|---|---|---|'
  ]
  for (const p of ordenado(ps)) {
    linhas.push(`| ${p.nome} | ${p.certas} | ${p.erradas} | ${pct(p)}% |`)
  }
  linhas.push('')
  return linhas
}

/** Nome de arquivo sem o que o sistema de arquivos recusa. */
const seguro = (s: string): string =>
  s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()

/**
 * A nota pronta: onde salvar, o cabeçalho e o texto.
 *
 * O caminho leva a HORA, e não só o dia: treinar duas vezes no mesmo dia é o
 * caso normal, e um arquivo por dia faria a sessão da noite apagar a da
 * tarde.
 */
export function notaDaSessao(s: SessaoNormalizada): {
  path: string
  frontmatter: Record<string, unknown>
  corpo: string
} {
  const geral = s.materias.reduce(
    (acc, p) => ({ nome: 'total', certas: acc.certas + p.certas, erradas: acc.erradas + p.erradas }),
    { nome: 'total', certas: 0, erradas: 0 }
  )
  const questoes = total(geral)
  const titulo = `Sessão de estudos — ${diaCurto(s.dia)}, ${s.inicio}`
  const periodo = s.fim ? `${s.inicio} às ${s.fim}` : s.inicio

  const partes: string[] = []
  const tempo = s.minutos > 0 ? `**${s.minutos} min** (${periodo})` : `**${periodo}**`
  partes.push(
    `${tempo} · **${questoes}** ${questoes === 1 ? 'questão' : 'questões'} · ` +
    `**${geral.certas}** ${geral.certas === 1 ? 'acerto' : 'acertos'} e ` +
    `**${geral.erradas}** ${geral.erradas === 1 ? 'erro' : 'erros'} · ` +
    `**${pct(geral)}%** de aproveitamento.`,
    ''
  )

  partes.push(...tabela('Por matéria', 'matéria', s.materias))
  partes.push(...tabela('Por conteúdo', 'conteúdo', s.conteudos))

  const d = destaques(s.conteudos.length > 0 ? s.conteudos : s.materias)
  if (d.bem.length > 0 || d.mal.length > 0) {
    partes.push('## O que este treino mostrou', '')
    if (d.bem.length > 0) {
      partes.push(`- **Fui bem em:** ${d.bem.map(p => `${p.nome} (${pct(p)}%)`).join(', ')}.`)
    }
    if (d.mal.length > 0) {
      partes.push(
        `- **Preciso voltar em:** ${d.mal.map(p => `${p.nome} (${pct(p)}%)`).join(', ')}.`
      )
    }
    partes.push('')
  } else {
    // Honestidade sobre a amostra: com menos de três questões por assunto não
    // dá para dizer onde ele vai bem, e um ranking aqui seria chute com cara
    // de dado.
    partes.push(
      `Treino curto para apontar forte e fraco — ${MINIMO_PARA_DESTAQUE} questões ` +
      'por assunto é o mínimo para isso significar algo.',
      ''
    )
  }

  return {
    path: `Estudos/Sessoes/${seguro(`${s.dia} ${s.inicio}`)}.md`,
    frontmatter: {
      tipo: 'sessao-estudo',
      titulo,
      data: s.dia,
      inicio: s.inicio,
      ...(s.fim ? { fim: s.fim } : {}),
      ...(s.minutos > 0 ? { minutos: s.minutos } : {}),
      questoes,
      acertos: geral.certas,
      aproveitamento: pct(geral)
    },
    corpo: partes.join('\n').trimEnd()
  }
}
