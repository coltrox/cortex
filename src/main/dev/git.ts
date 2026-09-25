import { execFile } from 'node:child_process'

/**
 * O pouco de git que o Cortex faz: ligar o projeto a um repositório do
 * GitHub, commitar e empurrar.
 *
 * Pedido do dono: "só jogar o link e apertar um botão de commit e outro de
 * push". Não é um cliente de git — não tem branch, merge, rebase nem
 * histórico. São os três gestos de quem trabalha sozinho e quer o código
 * salvo fora do PC.
 *
 * Nenhum comando vem da tela: a tela escolhe QUAL dos gestos, e os argumentos
 * saem daqui. A pasta é sempre resolvida pela lista de autorização (ver
 * `PastasDev`), e a URL passa por `urlDeRepositorio` antes de virar remoto.
 */

/** Quanto tempo um comando pode demorar. Push em rede ruim leva um tempo. */
const LIMITE_MS = 90_000

export type EstadoGit = {
  /** A pasta é um repositório git? */
  repo: boolean
  /** O ramo atual — vazio num repositório recém-criado, antes do primeiro commit. */
  ramo: string
  /** O endereço do `origin`, ou vazio quando ainda não há. */
  remoto: string
  /** Quantos arquivos estão diferentes do último commit. */
  alterados: number
  /** Commits feitos aqui que ainda não subiram. */
  aFrente: number
  /** Ainda não houve nenhum commit nesta pasta. */
  semCommit: boolean
}

/**
 * A URL de um repositório, limpa — ou `null`.
 *
 * Aceita o que o GitHub oferece para copiar: `https://github.com/user/repo`,
 * com ou sem `.git`, e `git@github.com:user/repo.git`. Recusa qualquer outra
 * coisa: esta URL vai virar argumento de um comando, e um endereço com
 * espaço, aspas ou `;` não é endereço, é tentativa.
 */
export function urlDeRepositorio(bruto: string): string | null {
  const url = (bruto ?? '').trim()
  if (!url || url.length > 300 || /[\s"'`;|&<>$]/.test(url)) return null
  if (/^git@[\w.-]+:[\w.-]+\/[\w.-]+?(\.git)?$/.test(url)) return url
  if (/^https:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/.test(url)) return url.replace(/\/$/, '')
  return null
}

/** A mensagem do commit, aparada. Vazia vira a padrão — commit sem texto não existe. */
export function mensagemDeCommit(bruto: string): string {
  const m = (bruto ?? '').replace(/\r/g, '').trim()
  return (m || 'Mudanças do dia').slice(0, 500)
}

/** Quantos arquivos mudaram, a partir do `git status --porcelain`. */
export function contarAlterados(saida: string): number {
  return saida.split('\n').filter(l => l.trim() !== '').length
}

/**
 * Quantos commits locais ainda não subiram, a partir do
 * `git rev-list --count @{u}..HEAD`. Sem ramo remoto configurado, o comando
 * falha e a conta é zero — não há para onde estar à frente.
 */
export function contarAFrente(saida: string): number {
  const n = Number((saida ?? '').trim())
  return Number.isInteger(n) && n >= 0 ? n : 0
}

export type Rodada = { ok: boolean; saida: string }

/** Roda um comando `git` na pasta e devolve a saída junta (com o erro, quando falha). */
export function rodarGit(cwd: string, args: string[]): Promise<Rodada> {
  return new Promise(resolve => {
    execFile('git', args, {
      cwd,
      timeout: LIMITE_MS,
      windowsHide: true,
      // Sem isto, um push que precise de senha trava esperando alguém digitar
      // num terminal que não existe — e o botão ficaria girando para sempre.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    }, (erro, out, err) => {
      const saida = `${out ?? ''}${err ?? ''}`.trim()
      resolve({ ok: !erro, saida: saida || (erro ? erro.message : '') })
    })
  })
}

export async function estadoGit(cwd: string): Promise<EstadoGit> {
  const dentro = await rodarGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (!dentro.ok || dentro.saida.trim() !== 'true') {
    return { repo: false, ramo: '', remoto: '', alterados: 0, aFrente: 0, semCommit: true }
  }
  const [ramo, remoto, status, frente, temCommit] = await Promise.all([
    rodarGit(cwd, ['branch', '--show-current']),
    rodarGit(cwd, ['remote', 'get-url', 'origin']),
    rodarGit(cwd, ['status', '--porcelain']),
    rodarGit(cwd, ['rev-list', '--count', '@{u}..HEAD']),
    rodarGit(cwd, ['rev-parse', '--verify', 'HEAD'])
  ])
  return {
    repo: true,
    ramo: ramo.ok ? ramo.saida.trim() : '',
    remoto: remoto.ok ? remoto.saida.trim() : '',
    alterados: contarAlterados(status.ok ? status.saida : ''),
    aFrente: frente.ok ? contarAFrente(frente.saida) : 0,
    semCommit: !temCommit.ok
  }
}

/** `git init` numa pasta que ainda não é repositório. O ramo nasce `main`. */
export async function iniciarRepo(cwd: string): Promise<Rodada> {
  const r = await rodarGit(cwd, ['init', '-b', 'main'])
  // Git antigo não conhece o `-b`; aí inicia e renomeia.
  if (r.ok) return r
  const simples = await rodarGit(cwd, ['init'])
  if (!simples.ok) return simples
  await rodarGit(cwd, ['branch', '-M', 'main'])
  return simples
}

/** Aponta o `origin` para a URL — trocando, se já houver um. */
export async function definirRemoto(cwd: string, url: string): Promise<Rodada> {
  const atual = await rodarGit(cwd, ['remote', 'get-url', 'origin'])
  return atual.ok
    ? rodarGit(cwd, ['remote', 'set-url', 'origin', url])
    : rodarGit(cwd, ['remote', 'add', 'origin', url])
}

/**
 * `git add -A` e `git commit`.
 *
 * Sem nada para commitar, volta `ok` com um recado: não é erro ter o trabalho
 * já salvo, e um vermelho na tela diria que algo quebrou.
 */
export async function commitar(cwd: string, mensagem: string): Promise<Rodada> {
  const add = await rodarGit(cwd, ['add', '-A'])
  if (!add.ok) return add
  const r = await rodarGit(cwd, ['commit', '-m', mensagem])
  if (!r.ok && /nothing to commit|nada a submeter/i.test(r.saida)) {
    return { ok: true, saida: 'Nada mudou desde o último commit.' }
  }
  return r
}

/** `git push`, criando o ramo lá se for a primeira vez. */
export function empurrar(cwd: string, ramo: string): Promise<Rodada> {
  return rodarGit(cwd, ['push', '-u', 'origin', ramo || 'HEAD'])
}
