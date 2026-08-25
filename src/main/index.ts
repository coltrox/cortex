import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { Session } from './session'
import { registerIpc } from './ipc/handlers'

const session = new Session()
let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Cortex',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

// Escolher pasta é privilégio do main: o renderer nunca informa caminho de vault.
ipcMain.handle('vault:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  await session.open(r.filePaths[0], rel => win?.webContents.send('vault:changed', rel))
  return { root: session.vault.root }
})

app.whenReady().then(() => {
  registerIpc(session)
  createWindow()
})

app.on('window-all-closed', async () => {
  await session.close()
  if (process.platform !== 'darwin') app.quit()
})
