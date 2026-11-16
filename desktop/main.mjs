import { app, BrowserWindow, dialog } from 'electron'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const appDirectory = app.getAppPath()
const serverPath = join(appDirectory, 'server', 'index.mjs')

let server
let mainWindow

async function createWindow() {
  process.env.MEHFIL_DATA_DIR = join(app.getPath('userData'), 'data')
  const { startServer } = await import(pathToFileURL(serverPath).href)
  server = startServer({
    host: '0.0.0.0',
    port: Number(process.env.MEHFIL_PORT || 47821),
    dataDirectory: process.env.MEHFIL_DATA_DIR,
    staticDirectory: resolve(appDirectory, 'dist'),
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('listening', resolveListen)
    server.once('error', rejectListen)
  })

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f7f8f6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
  await mainWindow.loadURL('http://127.0.0.1:47821/')
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('Could not start Mehfil Restaurant OS.', error)
  dialog.showErrorBox('Mehfil could not start', error instanceof Error ? error.message : String(error))
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

app.on('before-quit', () => {
  if (server?.listening) server.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
