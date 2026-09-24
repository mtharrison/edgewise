import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { createRequire } from 'module'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// Dev hook: expose the DevTools protocol for automated UI checks.
if (process.env.EDGEWISE_CDP_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.EDGEWISE_CDP_PORT)

const nativePath = app.isPackaged
  ? join(process.resourcesPath, 'native', 'logic.node')
  : join(app.getAppPath(), 'native', 'logic.node')
const { Engine } = createRequire(__filename)(nativePath)
const engine = new Engine()

// Methods the renderer may call. Everything else stays in the main process.
const ENGINE_METHODS = new Set([
  'listDevices', 'start', 'stop', 'status', 'render', 'samples', 'measure', 'findEdge',
  'addDecoder', 'updateDecoder', 'removeDecoder', 'decode', 'decoderRows',
  'annotations', 'annotationPage', 'annotationIndex', 'load', 'save', 'exportVcd'
])

const userFirmwareDir = join(app.getPath('userData'), 'firmware')

function firmwareDirs(): string[] {
  const dirs = [userFirmwareDir, join(process.resourcesPath ?? '', 'firmware')]
  // Reuse firmware shipped with PulseView if it is installed.
  try {
    for (const a of readdirSync('/Applications')) {
      if (/pulseview/i.test(a)) dirs.push(join('/Applications', a, 'Contents/share/sigrok-firmware'))
    }
  } catch {}
  dirs.push(
    '/opt/homebrew/share/sigrok-firmware',
    '/usr/local/share/sigrok-firmware',
    '/usr/share/sigrok-firmware',
    join(homedir(), '.local/share/sigrok-firmware')
  )
  return dirs.filter((d) => existsSync(d))
}

let win: BrowserWindow | null = null

function send(cmd: string) {
  win?.webContents.send('menu', cmd)
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Export VCD…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        { label: 'Open Firmware Folder', click: () => shell.openPath(userFirmwareDir) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Capture',
      submenu: [
        { label: 'Start / Stop', accelerator: 'CmdOrCtrl+R', click: () => send('toggle') },
        { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', click: () => send('fit') }
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0b0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  mkdirSync(userFirmwareDir, { recursive: true })
  engine.setFirmwareDirs(firmwareDirs())

  ipcMain.handle('engine', (_e, method: string, args: unknown[]) => {
    if (!ENGINE_METHODS.has(method)) throw new Error(`Unknown engine method ${method}`)
    return engine[method](...args)
  })
  ipcMain.handle('dialog:open', async () => {
    const r = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'sigrok session', extensions: ['sr'] }],
      properties: ['openFile']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:save', async (_e, kind: 'sr' | 'vcd') => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: `capture.${kind}`,
      filters: [kind === 'sr' ? { name: 'sigrok session', extensions: ['sr'] } : { name: 'Value Change Dump', extensions: ['vcd'] }]
    })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('firmware:open', () => shell.openPath(userFirmwareDir))

  buildMenu()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  engine.stop()
  if (process.platform !== 'darwin') app.quit()
})
