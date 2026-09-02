import { app, BrowserWindow, Menu, ipcMain, dialog, shell, session as sessaoEletron } from 'electron'
import { join, resolve, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { Session } from './session'
import { registerIpc, sincronizadorDe } from './ipc/handlers'
import { ligarCampainha, desligarCampainha } from './nuvem/campainha'
import { Processos, scriptsDoProjeto } from './dev/processos'
import { projetarConfigParaRenderer, type ConfigParaRenderer } from './config'

const session = new Session()

/**
 * Os `npm run` que o Cortex esta rodando.
 *
 * Fica no modulo, e nao na sessao: um servidor de desenvolvimento nao deve
 * morrer porque o usuario trocou de vault. Ele morre quando o app fecha.
 */
const processos = new Processos()
let win: BrowserWindow | null = null

/**
 * Onde fica a memória de qual vault foi aberto por último.
 *
 * Vai no userData do Electron, e não no vault: é a única coisa que precisa
 * ser conhecida ANTES de existir um vault aberto. Guarda só um caminho.
 */
const memoriaPath = (): string => join(app.getPath('userData'), 'cortex.json')

async function lembrarVault(root: string): Promise<void> {
  try {
    await writeFile(memoriaPath(), JSON.stringify({ ultimoVault: root }, null, 2), 'utf8')
  } catch {
    // Não poder lembrar não é motivo para não abrir. Na próxima vez o app
    // pergunta de novo, e só.
  }
}

async function vaultLembrado(): Promise<string | null> {
  try {
    const o = JSON.parse(await readFile(memoriaPath(), 'utf8')) as { ultimoVault?: unknown }
    return typeof o.ultimoVault === 'string' && o.ultimoVault ? o.ultimoVault : null
  } catch {
    return null
  }
}

function avisarMudanca(rel: string): void {
  win?.webContents.send('vault:changed', rel)
}

/**
 * Abre a sessão e memoriza. Devolve o estado que o renderer espera.
 *
 * `config` é sempre o recorte de `projetarConfigParaRenderer`, nunca
 * `session.config` inteiro — este é um dos quatro pontos que mandam config
 * pro renderer (junto de `vault:state` e o evento `vault:aberto`), e
 * `vaultId`/`nuvem` (que carrega a chave da nuvem) não têm por que atravessar
 * esse canal.
 */
async function abrirVault(root: string): Promise<{ root: string; config: ConfigParaRenderer }> {
  await session.open(root, avisarMudanca)
  await lembrarVault(session.vault.root)
  ligarCampainha(session.config, aoTocarCampainha)
  return { root: session.vault.root, config: projetarConfigParaRenderer(session.config) }
}

/**
 * O celular gravou alguma coisa: puxa agora.
 *
 * O relógio de dois minutos do renderer continua no lugar como rede de
 * segurança — este caminho só adianta o que ele faria. Por isso a falha aqui
 * é silenciosa: um toque perdido custa, no pior caso, esperar o relógio.
 *
 * Não precisa avisar a tela: aplicar um evento grava no vault, o
 * `VaultWatcher` vê a gravação e dispara `vault:changed` como em qualquer
 * outra mudança de arquivo. O caminho de volta já existia.
 */
function aoTocarCampainha(t: 'eventos' | 'cardapio'): void {
  if (t !== 'eventos' || !session.isOpen) return
  void puxarAgora(true)
}

/**
 * Puxa os eventos do celular fora do relógio.
 *
 * O `try` não é decoração: `sincronizadorDe` lança de forma SÍNCRONA quando
 * não há credencial, antes de existir promessa alguma — um `.catch()` no
 * retorno não pegaria isso, e um throw solto aqui dentro sobe pelo tratador
 * de mensagem do WebSocket, no processo principal, sem ninguém acima para
 * segurar.
 *
 * `podeReTentar` cobre a única janela em que um toque se perderia: se a
 * rodada do relógio já estava em andamento quando o evento chegou ao banco,
 * ela pode tê-lo lido antes de ele existir, e a chamada disparada pelo toque
 * desiste (ver `sincronizandoAgora`, em `nuvem/sincronizador.ts`). Uma
 * segunda tentativa poucos segundos depois fecha essa janela sem inventar
 * fila nenhuma.
 */
async function puxarAgora(podeReTentar: boolean): Promise<void> {
  try {
    const r = await sincronizadorDe(session).sincronizar()
    if (r.pulado && podeReTentar) {
      setTimeout(() => { void puxarAgora(false) }, 3000)
    }
  } catch (err) {
    // Falhar aqui custa esperar o relógio de dois minutos, e nada além disso.
    console.error('[cortex] sincronização disparada pela campainha falhou:', err)
  }
}

function createWindow(): void {
  /*
   * Fora a barra de menu do Electron (File, Edit, View, Window).
   *
   * Ela vem de graça e não pertence a este app: o Cortex não abre arquivo por
   * menu e não tem Recortar/Colar de aplicação.
   *
   * Sai SEMPRE, inclusive em desenvolvimento — antes ela ficava ali só para
   * dar Ctrl+R e devtools, o que fazia a tela de quem programa ser diferente
   * da tela de quem usa. Os dois atalhos são registrados à mão logo abaixo,
   * então nada se perde.
   */
  Menu.setApplicationMenu(null)

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    title: 'Cortex',
    backgroundColor: '#FBFBFA',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  /*
   * Os dois atalhos que a barra de menu dava, agora sem a barra.
   *
   * Só fora do app empacotado: recarregar a janela no meio do uso normal
   * descartaria o que estivesse sendo escrito, e devtools num app pessoal é
   * porta aberta para colar código que alguém mandou pelo WhatsApp.
   */
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (evento, entrada) => {
      if (entrada.type !== 'keyDown') return
      const ctrl = entrada.control || entrada.meta
      if (ctrl && entrada.key.toLowerCase() === 'r') {
        evento.preventDefault()
        win?.webContents.reload()
      }
      if (entrada.key === 'F12' || (ctrl && entrada.shift && entrada.key.toLowerCase() === 'i')) {
        evento.preventDefault()
        win?.webContents.toggleDevTools()
      }
    })
  }

  // Nada nesta janela pode navegar para fora nem abrir janela nova: o app é
  // local, e um link clicado dentro de uma nota abre no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

/* ---------- canais privilegiados ----------
 * Estes não passam por IPC_SCHEMAS porque não recebem caminho do renderer: o
 * caminho nasce de um diálogo nativo. É o que impede o renderer de nomear
 * qualquer pasta do disco.
 */

ipcMain.handle('vault:state', async () => {
  if (session.isOpen) return { root: session.vault.root, config: projetarConfigParaRenderer(session.config) }
  return { root: null, config: null }
})

ipcMain.handle('vault:pick', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolher a pasta do vault',
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return null
  return abrirVault(r.filePaths[0])
})

/**
 * Onde moram os vaults que o app cria.
 *
 * `userData` é a pasta do próprio Cortex, por usuário — e NÃO a pasta onde o
 * app foi instalado. A diferença importa: o desinstalador do NSIS apaga o
 * diretório de instalação inteiro, e uma atualização reinstala por cima. Um
 * vault ali dentro morreria numa desinstalação, sem aviso e sem desfazer.
 * `userData` sobrevive às duas (ver `deleteAppDataOnUninstall: false` no
 * electron-builder.yml).
 *
 * Também não é mais o Desktop, que era o padrão do diálogo: aceitar o padrão
 * plantou um vault por cima de uma pasta `Cortex` que já tinha outra coisa
 * dentro.
 */
function pastaDosVaults(): string {
  return join(app.getPath('userData'), 'vaults')
}

/**
 * O primeiro nome livre dentro de `vaults`.
 *
 * Criar não pode cair num vault que já existe: quem clicou em criar quer um
 * vault novo, e reaproveitar a pasta misturaria as notas dos dois.
 */
async function nomeDeVaultLivre(base: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const alvo = join(pastaDosVaults(), n === 1 ? base : `${base} ${n}`)
    try {
      await stat(alvo)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return alvo
      throw err
    }
  }
  throw new Error('há vaults demais nesta pasta — apague os que não usa')
}

ipcMain.handle('vault:create', async () => {
  // Sem diálogo: clicar em criar cria. O caminho continua nascendo aqui no
  // processo principal, e não do renderer — é a mesma garantia que o diálogo
  // nativo dava, sem obrigar ninguém a escolher uma pasta.
  const alvo = await nomeDeVaultLivre('Cortex')
  await mkdir(alvo, { recursive: true })
  return abrirVault(alvo)
})

ipcMain.handle('dev:add-folder', async () => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const r = await dialog.showOpenDialog({
    title: 'Autorizar uma pasta de código',
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return session.config.pastasDev
  const nova = resolve(r.filePaths[0])
  const atuais = session.config.pastasDev
  if (atuais.some(p => resolve(p) === nova)) return atuais
  const c = await session.salvarConfig({ pastasDev: [...atuais, nova] })
  return c.pastasDev
})

/**
 * Autoriza uma pasta que o usuário arrastou para a janela.
 *
 * Aqui o renderer nomeia um caminho absoluto — a única vez em todo o app. Por
 * isso o processo principal não confia nele: confirma que é mesmo um
 * diretório e PERGUNTA ao usuário, com o caminho na tela, antes de gravar na
 * lista de autorização. Um arrastar sem querer não pode virar acesso
 * permanente a uma pasta, e a confirmação é o que mantém a autorização sendo
 * uma decisão humana, como no diálogo nativo.
 */
ipcMain.handle('dev:add-dropped', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { caminho?: unknown }
  if (typeof p.caminho !== 'string' || !p.caminho) throw new Error('caminho inválido')

  const alvo = resolve(p.caminho)
  const s = await stat(alvo).catch(() => null)
  if (!s?.isDirectory()) throw new Error('arraste uma pasta, não um arquivo')

  const atuais = session.config.pastasDev
  if (atuais.some(x => resolve(x) === alvo)) return atuais

  const r = await dialog.showMessageBox({
    type: 'question',
    title: 'Autorizar pasta de código',
    message: `Dar ao Cortex acesso de leitura e escrita a esta pasta?`,
    detail: alvo,
    buttons: ['Autorizar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1
  })
  if (r.response !== 0) return atuais

  const c = await session.salvarConfig({ pastasDev: [...atuais, alvo] })
  return c.pastasDev
})

/**
 * Abre um terminal na pasta.
 *
 * A pasta passa por `PastasDev.resolver` antes: mesmo sendo o processo
 * principal, uma raiz não autorizada não vira `cwd` de nada. E o caminho vai
 * como `cwd` do processo, nunca concatenado dentro de uma linha de comando —
 * é isso que impede um nome de pasta com aspas ou `&` de virar comando.
 */
ipcMain.handle('dev:terminal', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const sub = typeof p.sub === 'string' ? p.sub : ''
  const cwd = session.pastasDev.resolver(p.raiz, sub)

  if (process.platform === 'win32') {
    // `start ""` abre uma janela nova de console herdando o cwd deste spawn.
    spawn(process.env.ComSpec ?? 'cmd.exe', ['/c', 'start', '', 'cmd.exe'], {
      cwd, detached: true, stdio: 'ignore', windowsHide: false
    }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', cwd], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('x-terminal-emulator', [], { cwd, detached: true, stdio: 'ignore' }).unref()
  }
  return { cwd: basename(cwd) }
})

/** Os scripts do package.json daquele projeto. Lista vazia se nao houver. */
ipcMain.handle('dev:scripts', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const cwd = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  return { scripts: await scriptsDoProjeto(cwd) }
})

/**
 * Roda um script do projeto dentro do app.
 *
 * O renderer manda o NOME do script; `Processos.iniciar` recusa qualquer um
 * que nao esteja no package.json. Nunca um comando livre.
 */
ipcMain.handle('dev:rodar', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown; script?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  if (typeof p.script !== 'string' || p.script === '') throw new Error('script inválido')
  const cwd = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  return processos.iniciar(p.raiz, cwd, p.script)
})

ipcMain.handle('dev:parar', async (_e, payload: unknown) => {
  const p = (payload ?? {}) as { id?: unknown }
  if (typeof p.id !== 'string') throw new Error('id inválido')
  processos.parar(p.id)
  return { ok: true }
})

ipcMain.handle('dev:processos', async () => ({ processos: processos.listar() }))

ipcMain.handle('dev:saida', async (_e, payload: unknown) => {
  const p = (payload ?? {}) as { id?: unknown }
  if (typeof p.id !== 'string') throw new Error('id inválido')
  return { linhas: processos.saida(p.id) }
})

ipcMain.handle('dev:limpar-encerrados', async () => {
  processos.limparEncerrados()
  return { processos: processos.listar() }
})

/**
 * Abre a pasta do projeto no VS Code.
 *
 * `code` e um .cmd no Windows, por isso o shell. O caminho vai como
 * argumento separado -- concatena-lo numa string deixaria um projeto com
 * espaco ou aspas no nome virar comando.
 */
ipcMain.handle('dev:vscode', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const alvo = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  const filho = spawn('code', [alvo], {
    shell: process.platform === 'win32', detached: true, stdio: 'ignore', windowsHide: true
  })
  filho.unref()
  return new Promise(resolve => {
    // `code` nao instalado e o caso comum, e o erro so aparece de forma
    // assincrona. Sem esta espera curta, a tela diria "abrindo" para sempre.
    filho.on('error', () => resolve({ ok: false, motivo: 'VS Code não encontrado no PATH' }))
    setTimeout(() => resolve({ ok: true }), 400)
  })
})

/** Abre a pasta no explorador de arquivos do sistema. */
ipcMain.handle('dev:reveal', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const alvo = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  await shell.openPath(alvo)
  return { ok: true }
})

// Fechar o app tem que levar junto o que ele iniciou: sem isto, um
// `npm run dev` fica vivo segurando a porta, e a unica forma de perceber e
// pelo gerenciador de tarefas.
app.on('before-quit', () => processos.pararTudo())

app.whenReady().then(async () => {
  // Em produção o renderer é um arquivo local e não deve poder buscar nada na
  // rede. Em dev a CSP fica de fora porque o HMR do Vite usa websocket e
  // eval — travar isso quebraria o ciclo de desenvolvimento sem tornar o app
  // empacotado mais seguro.
  if (!process.env.ELECTRON_RENDERER_URL) {
    sessaoEletron.defaultSession.webRequest.onHeadersReceived((detalhes, cb) => {
      cb({
        responseHeaders: {
          ...detalhes.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; font-src 'self' data:; connect-src 'none'; " +
            "object-src 'none'; base-uri 'none'; form-action 'none'"
          ]
        }
      })
    })
  }

  registerIpc(session)
  createWindow()

  // Reabre o último vault sozinho. A tela de abertura só aparece de verdade
  // no primeiro uso — ou se a pasta lembrada sumiu.
  const lembrado = await vaultLembrado()
  if (lembrado) {
    try {
      // Passa por `abrirVault` para não haver dois caminhos de abertura: foi
      // exatamente essa duplicação que deixaria a campainha ligada só quando
      // o vault fosse escolhido à mão, e muda no caso mais comum, que é o app
      // reabrindo sozinho no vault de sempre.
      const aberto = await abrirVault(lembrado)
      win?.webContents.send('vault:aberto', aberto)
    } catch {
      // Pasta apagada, drive desconectado, permissão negada: cai na abertura.
    }
  }
})

app.on('window-all-closed', async () => {
  desligarCampainha()
  await session.close()
  if (process.platform !== 'darwin') app.quit()
})
