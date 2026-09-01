import { app, BrowserWindow, Menu, ipcMain, dialog, shell, session as sessaoEletron } from 'electron'
import { join, resolve, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { Session } from './session'
import { registerIpc } from './ipc/handlers'
import { projetarConfigParaRenderer, type ConfigParaRenderer } from './config'

const session = new Session()
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
  return { root: session.vault.root, config: projetarConfigParaRenderer(session.config) }
}

function createWindow(): void {
  /*
   * Fora a barra de menu do Electron (File, Edit, View, Window).
   *
   * Ela vem de graça e não pertence a este app: o Cortex não abre arquivo
   * por menu, não tem Recortar/Colar de aplicação, e "View > Toggle
   * Developer Tools" num app pessoal empacotado é só ruído na tela.
   *
   * Só no app empacotado. Em desenvolvimento a barra fica, porque é dela que
   * vêm o Ctrl+R para recarregar e o atalho do devtools — tirá-la ali
   * custaria uma hora por dia de `npm run dev` fechado e aberto de novo.
   */
  if (app.isPackaged) Menu.setApplicationMenu(null)

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

ipcMain.handle('vault:create', async () => {
  const r = await dialog.showSaveDialog({
    title: 'Criar um vault novo',
    defaultPath: join(app.getPath('desktop'), 'Cortex'),
    buttonLabel: 'Criar vault',
    properties: ['createDirectory']
  })
  if (r.canceled || !r.filePath) return null

  // `showSaveDialog` devolve um caminho que pode já existir como arquivo —
  // criar um vault por cima de um arquivo daria um erro obscuro lá na frente.
  try {
    const s = await stat(r.filePath)
    if (!s.isDirectory()) throw new Error('já existe um arquivo com esse nome')
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
  }

  await mkdir(r.filePath, { recursive: true })
  return abrirVault(r.filePath)
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

/** Abre a pasta no explorador de arquivos do sistema. */
ipcMain.handle('dev:reveal', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const alvo = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  await shell.openPath(alvo)
  return { ok: true }
})

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
      await session.open(lembrado, avisarMudanca)
      win?.webContents.send('vault:aberto', {
        root: session.vault.root, config: projetarConfigParaRenderer(session.config)
      })
    } catch {
      // Pasta apagada, drive desconectado, permissão negada: cai na abertura.
    }
  }
})

app.on('window-all-closed', async () => {
  await session.close()
  if (process.platform !== 'darwin') app.quit()
})
