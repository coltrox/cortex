import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

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
  /** Identificador deste vault para a captura rápida. Ver `novoVaultId`. */
  vaultId: string
  /** Credenciais do Supabase. `null` enquanto a nuvem não foi configurada. */
  nuvem: { url: string; chave: string } | null
  /**
   * O segredo da senha dos painéis, no formato de `senha.ts`. `null` = sem senha.
   *
   * É o resultado de um scrypt com sal, nunca a senha. Mora aqui, dentro do
   * vault, e não no userData do Electron, para que zipar a pasta e abrir noutra
   * máquina continue pedindo a mesma senha — e não abra sozinho.
   */
  senha: string | null
  /**
   * Áreas que exigem a senha para abrir.
   *
   * Invariante mantida por `normalizarConfig`: sem `senha`, esta lista é
   * sempre vazia. Um painel trancado sem senha cadastrada seria um painel que
   * ninguém consegue abrir, inclusive o dono.
   */
  paineisTrancados: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * O identificador do vault, gerado OFFLINE.
 *
 * É a única credencial da captura rápida: quem tem o id escreve neste vault.
 * Nasce aqui, e não no banco, porque assim o Cortex não precisa escrever nada
 * lá nem para se registrar — o que mantém de pé a regra de que só o cardápio
 * sobe.
 */
export function novoVaultId(): string {
  return randomUUID()
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

export const CONFIG_PADRAO: Config = {
  areas: [...IDS_AREAS], pastasDev: [], escolheu: false, vaultId: '', nuvem: null,
  senha: null, paineisTrancados: []
}

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

  // Um id ausente ou corrompido é substituído; um id válido é sagrado —
  // trocá-lo sozinho deixaria todos os celulares apontando para o vazio.
  const idBruto = typeof o.vaultId === 'string' ? o.vaultId : ''
  const vaultId = UUID.test(idBruto) ? idBruto : novoVaultId()

  const n = o.nuvem as { url?: unknown; chave?: unknown } | undefined
  const nuvem = n && typeof n.url === 'string' && n.url && typeof n.chave === 'string' && n.chave
    ? { url: n.url, chave: n.chave }
    : null

  // Só reconhece um segredo com a marca do formato de `senha.ts`. Qualquer
  // outra coisa no campo — inclusive uma senha em texto puro que alguém tenha
  // escrito à mão achando que bastaria — vale como "sem senha".
  const senha = typeof o.senha === 'string' && o.senha.startsWith('scrypt$') ? o.senha : null

  // Sem senha, nenhum painel fica trancado. Um painel trancado sem senha
  // cadastrada seria um painel que ninguém abre, nem o dono.
  const paineisTrancados = senha && Array.isArray(o.paineisTrancados)
    ? [...new Set(o.paineisTrancados.filter(
        (a): a is string => typeof a === 'string' && IDS_AREAS.includes(a)))]
    : []

  return { areas, pastasDev, escolheu: o.escolheu === true, vaultId, nuvem, senha, paineisTrancados }
}

/**
 * Lê o `vaultId` cru do disco, sem validar nem gerar — só o que estava no
 * JSON, ou `undefined` se o campo faltar, o arquivo não existir ou não for
 * um JSON válido.
 *
 * Existe só para quem grava depois de ler (`Session.open`) saber se o id
 * mudou e precisa regravar. A validação e a geração continuam sendo
 * exclusividade de `normalizarConfig` — esta função não decide qual id é
 * válido, só relata o que havia antes da decisão.
 */
export async function vaultIdBruto(caminho: string): Promise<string | undefined> {
  try {
    const o = JSON.parse(await readFile(caminho, 'utf8')) as Record<string, unknown>
    return typeof o.vaultId === 'string' ? o.vaultId : undefined
  } catch {
    return undefined
  }
}

export async function lerConfig(caminho: string): Promise<Config> {
  try {
    return normalizarConfig(JSON.parse(await readFile(caminho, 'utf8')))
  } catch {
    // Ausente ou ilegível: o vault abre com tudo ligado. Passa por
    // `normalizarConfig` — e não pelo padrão cru — porque é ela que gera o
    // vaultId; devolver a constante deixaria o vault novo sem identificador,
    // e a captura rápida nasceria quebrada.
    return normalizarConfig({})
  }
}

export async function gravarConfig(caminho: string, c: Config): Promise<void> {
  await writeFile(caminho, `${JSON.stringify(c, null, 2)}\n`, 'utf8')
}

/** O que o renderer pode enxergar da config, e nada mais. */
export type ConfigParaRenderer = {
  areas: string[]
  pastasDev: string[]
  escolheu: boolean
  /** Quais painéis pedem senha — a tela precisa saber para desenhar a tranca. */
  paineisTrancados: string[]
  /** Se existe senha cadastrada. O segredo em si nunca cruza esta fronteira. */
  temSenha: boolean
}

/**
 * Recorte de `Config` para atravessar a fronteira IPC até o renderer.
 *
 * Lista branca campo a campo, na mesma disciplina que `montarCardapio` usa
 * para o que sobe para a nuvem: quem chama nunca repassa `Config` inteiro
 * para `vault:state`, `vault:pick`, `vault:create`, o evento `vault:aberto`
 * ou `config:get`. `vaultId` e, principalmente, `nuvem` (que carrega a chave
 * do Supabase em texto puro) não têm por que cruzar esse canal — o renderer
 * é entrada hostil neste projeto, e o mesmo vale ao contrário: ele não
 * recebe o que não precisa. O id do vault e se a nuvem está configurada
 * saem só por `nuvem:estado`, que já é um recorte explícito próprio; a
 * chave em si não sai por canal nenhum.
 */
export function projetarConfigParaRenderer(c: Config): ConfigParaRenderer {
  return {
    areas: c.areas,
    pastasDev: c.pastasDev,
    escolheu: c.escolheu,
    paineisTrancados: c.paineisTrancados,
    // Booleano, nunca o segredo: o renderer precisa saber SE há senha para
    // desenhar "criar" ou "trocar", e nada além disso. Conferir a senha é
    // trabalho do processo principal.
    temSenha: c.senha !== null
  }
}
