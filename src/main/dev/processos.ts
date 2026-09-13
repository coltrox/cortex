import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Os processos de projeto que o Cortex está rodando.
 *
 * O que isto resolve: "rodar localmente" sem abrir um terminal, ver a saída
 * dentro do app, e clicar no endereço quando o servidor sobe.
 *
 * ## A guarda que importa
 *
 * O renderer manda um NOME DE SCRIPT, nunca um comando. O nome é conferido
 * contra os scripts que existem no `package.json` daquele projeto, e o que
 * roda é sempre `npm run <script>`, com os argumentos passados como lista e
 * jamais concatenados numa string de shell. Sem isso, esta classe seria uma
 * execução de comando arbitrário à disposição de qualquer código que rodasse
 * no renderer — que é entrada hostil neste projeto.
 *
 * Criar projeto novo (`novoProjeto.ts`) passa pelo mesmo caminho: as etapas
 * são montadas pelo processo principal a partir de uma tabela fixa.
 */

/** Quantas linhas de saída ficam guardadas por processo. */
const TETO_LINHAS = 400

/**
 * Tira os códigos de cor da saída.
 *
 * O painel mostra texto — não é um emulador de terminal —, então uma sequência
 * de cor apareceria literalmente na tela. Pior: o Vite pinta o NÚMERO DA PORTA
 * em negrito, e o escape cai no meio do endereço:
 *
 *     http://localhost:<ESC>[1m5173<ESC>[22m/
 *
 * Sem limpar antes, `RE_URL` casa até o primeiro espaço e o link fica com
 * bytes de escape grudados — clicar nele não abre nada. Era o "link todo
 * bugado". Limpar aqui, e não no renderer, mantém guardado o mesmo texto que
 * a tela mostra e que a busca do endereço lê.
 *
 * Montadas com `new RegExp` a partir de string: um `` literal dentro de
 * uma expressão regular some com facilidade ao editar o arquivo, e um escape
 * perdido aqui transforma a limpeza numa função que não limpa nada.
 *
 * Cobre as duas famílias que aparecem na prática: CSI (cor, cursor) e OSC
 * (título de janela, links de terminal), esta terminada por BEL ou ESC\.
 */
const RE_OSC = new RegExp('\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)', 'g')
const RE_CSI = new RegExp('\\u001b\\[[0-9;?]*[ -/]*[@-~]', 'g')

export function semCores(linha: string): string {
  return linha.replace(RE_OSC, '').replace(RE_CSI, '')
}

/**
 * Detecta o endereço que um servidor de desenvolvimento imprime ao subir.
 *
 * `<` e `>` fora do casamento junto com aspas: alguns servidores imprimem o
 * endereço entre sinais de menor e maior, e eles entrariam no link.
 */
const RE_URL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s"'<>]*/i

export type ProcessoInfo = {
  id: string
  raiz: string
  script: string
  pid: number | null
  url: string | null
  /** `null` enquanto está rodando; o código de saída depois que termina. */
  saiu: number | null
}

/**
 * Um comando de uma sequência — `npx create-vite ...`, depois `npm install`.
 *
 * Quem monta é SEMPRE o processo principal, a partir de tabelas fixas: os
 * scripts do `package.json` em `iniciar`, e `novoProjeto.ts`. A tela nunca
 * chega perto disto.
 */
export type Etapa = {
  comando: string
  args: string[]
  cwd: string
  /** Variáveis a mais só para esta etapa — `CI=1` tira as perguntas dos criadores. */
  env?: Record<string, string>
}

type Processo = ProcessoInfo & {
  linhas: string[]
  filho: ChildProcess | null
  /** Parado pelo botão: a próxima etapa da sequência não começa. */
  parado: boolean
}

/** Os scripts declarados no package.json do projeto, ou lista vazia. */
export async function scriptsDoProjeto(cwd: string): Promise<string[]> {
  try {
    const bruto = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as unknown
    if (!bruto || typeof bruto !== 'object') return []
    const s = (bruto as { scripts?: unknown }).scripts
    if (!s || typeof s !== 'object' || Array.isArray(s)) return []
    return Object.keys(s as Record<string, unknown>)
  } catch {
    // Sem package.json, ilegível, ou JSON quebrado: o projeto simplesmente
    // não tem scripts. Não é erro — nem todo projeto é Node.
    return []
  }
}

export class Processos {
  private mapa = new Map<string, Processo>()

  /**
   * Roda `npm run <script>` na pasta do projeto.
   *
   * Recusa um script que não esteja no package.json: é a linha entre "botão
   * de atalho" e "executar o que a tela mandar".
   */
  async iniciar(raiz: string, cwd: string, script: string): Promise<ProcessoInfo> {
    const permitidos = await scriptsDoProjeto(cwd)
    if (!permitidos.includes(script)) {
      throw new Error('"' + script + '" não é um script do package.json deste projeto')
    }
    return this.iniciarEtapas(raiz, script, [{ comando: 'npm', args: ['run', script], cwd }])
  }

  /**
   * Roda uma sequência de comandos, um depois do outro, como UM processo na
   * tela — criar o projeto e instalar aparecem numa saída só.
   *
   * Uma etapa que sai com erro encerra a sequência: rodar `npm install` numa
   * pasta que o criador não terminou de montar só empilharia erros por cima
   * do erro que importa.
   */
  iniciarEtapas(raiz: string, rotulo: string, etapas: Etapa[]): ProcessoInfo {
    const p: Processo = {
      id: randomUUID(), raiz, script: rotulo, pid: null, url: null, saiu: null,
      linhas: [], filho: null, parado: false
    }

    const engolir = (b: Buffer | string): void => {
      for (const bruta of String(b).split(/\r?\n/)) {
        // Limpa ANTES de guardar e antes de procurar o endereço: o painel
        // mostra estas mesmas linhas, e a busca do link lê o mesmo texto.
        const linha = semCores(bruta).replace(/\r/g, '').trimEnd()
        if (linha === '') continue
        p.linhas.push(linha)
        // Anel: um servidor de desenvolvimento rodando o dia inteiro imprime
        // sem parar, e guardar tudo comeria a memória do processo principal.
        if (p.linhas.length > TETO_LINHAS) p.linhas.shift()
        if (!p.url) {
          const m = RE_URL.exec(linha)
          if (m) p.url = m[0]
        }
      }
    }

    const rodar = (i: number): void => {
      const etapa = etapas[i]
      if (!etapa) { p.saiu = 0; return }
      // Numa sequência, cada comando se anuncia: sem isto a saída do `npm
      // install` pareceria continuação do criador do projeto.
      if (etapas.length > 1) engolir(`[cortex] ${etapa.comando} ${etapa.args.join(' ')}`)

      // `shell: true` no Windows porque `npm` e `npx` são .cmd e sem shell o
      // spawn não os encontra. Os argumentos continuam indo como lista, e
      // todos saem de tabela fixa ou de nome já conferido — não existe string
      // de comando montada a partir de entrada do renderer.
      const filho = spawn(etapa.comando, etapa.args, {
        cwd: etapa.cwd,
        shell: process.platform === 'win32',
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0', ...etapa.env }
      })

      p.filho = filho
      p.pid = filho.pid ?? null
      let falhou = false

      filho.stdout?.on('data', engolir)
      filho.stderr?.on('data', engolir)
      filho.on('error', e => {
        // Pasta que não existe, comando que não existe: o `close` pode nem
        // vir, e sem marcar aqui o processo ficaria "rodando" para sempre.
        falhou = true
        engolir('[cortex] não deu para iniciar: ' + e.message)
        p.filho = null
        if (p.saiu === null) p.saiu = 1
      })
      filho.on('close', codigo => {
        if (falhou) return
        p.filho = null
        const c = codigo ?? 0
        if (c !== 0 || p.parado) { p.saiu = c; return }
        rodar(i + 1)
      })
    }

    this.mapa.set(p.id, p)
    rodar(0)
    return this.publico(p)
  }

  /**
   * Encerra o processo e os filhos dele.
   *
   * `npm run dev` é um pai que gera o servidor de verdade como filho: matar
   * só o `npm` deixaria a porta ocupada por um órfão, e a próxima tentativa
   * de rodar falharia com "porta em uso" sem explicação nenhuma.
   */
  parar(id: string): void {
    const p = this.mapa.get(id)
    if (!p) return
    // Antes de matar: numa sequência, o `close` que vem a seguir não pode
    // começar a próxima etapa.
    p.parado = true
    if (!p.filho) return
    const pid = p.filho.pid
    if (pid === undefined) return

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    } else {
      try {
        p.filho.kill('SIGTERM')
      } catch {
        /* já morreu */
      }
    }
  }

  /** Tudo que está rodando, sem as linhas de saída (elas saem por `saida`). */
  listar(): ProcessoInfo[] {
    return [...this.mapa.values()].map(p => this.publico(p))
  }

  saida(id: string): string[] {
    return this.mapa.get(id)?.linhas ?? []
  }

  /**
   * Encerra tudo. Chamado ao fechar o app.
   *
   * Sem isto, fechar o Cortex deixaria um `npm run dev` vivo segurando a
   * porta, e a única forma de perceber seria o gerenciador de tarefas.
   */
  pararTudo(): void {
    for (const id of this.mapa.keys()) this.parar(id)
  }

  /** Esquece processos já encerrados, para a lista não crescer para sempre. */
  limparEncerrados(): void {
    for (const [id, p] of this.mapa) if (p.saiu !== null) this.mapa.delete(id)
  }

  private publico(p: Processo): ProcessoInfo {
    return { id: p.id, raiz: p.raiz, script: p.script, pid: p.pid, url: p.url, saiu: p.saiu }
  }
}
