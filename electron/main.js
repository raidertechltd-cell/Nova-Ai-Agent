const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, session } = require('electron')
const path = require('path')

const WS_PORT = process.env.WS_PORT || 4001
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://nova-ai-agent-xi.vercel.app'
const DEV = !!process.env.ELECTRON_DEV

let tray = null
let mainWindow = null
let ws = null

// Auto-grant microphone permission (needed for capture)
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') return callback(true)
    callback(false)
  })
})

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(480, width),
    height: Math.min(720, height),
    minWidth: 360,
    minHeight: 600,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(FRONTEND_URL)

  // Hide instead of close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('blur', () => {
    if (!DEV) mainWindow.hide()
  })

  if (DEV) mainWindow.webContents.openDevTools({ mode: 'detach' })
}

function createTray() {
  // Create a 16x16 tray icon
  const iconSize = 16
  const icon = nativeImage.createEmpty()
  // Fallback: use a small colored square since we don't have an icon file
  const canvas = Buffer.alloc(iconSize * iconSize * 4)
  for (let i = 0; i < iconSize * iconSize; i++) {
    canvas[i * 4] = 100      // R
    canvas[i * 4 + 1] = 180  // G
    canvas[i * 4 + 2] = 255  // B
    canvas[i * 4 + 3] = 255  // A
  }
  const trayIcon = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize })

  tray = new Tray(trayIcon)
  tray.setToolTip('Nova AI')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Nova', click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'DevTools',
      click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }),
      visible: DEV,
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => showWindow())
}

function showWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
  mainWindow.setAlwaysOnTop(true)
  // Flash the window briefly
  mainWindow.once('focus', () => mainWindow.setAlwaysOnTop(false))
}

function connectWebSocket() {
  // Connect to the backend WebSocket server (ws-server.js on port 4001)
  const WebSocket = require('ws')
  ws = new WebSocket(`ws://localhost:${WS_PORT}`)

  ws.on('open', () => console.log('[electron] WS connected to sentinel'))
  ws.on('message', (data) => {
    const msg = typeof data === 'string' ? data : data.toString()
    console.log('[electron] WS message:', msg)
    if (msg === 'WAKE_SIGNAL' || msg.includes('WAKE_SIGNAL')) {
      showWindow()
    }
  })
  ws.on('close', () => {
    console.log('[electron] WS disconnected, retrying in 5s')
    setTimeout(connectWebSocket, 5000)
  })
  ws.on('error', () => { /* will trigger close */ })
}

// IPC from renderer (clap detection in browser)
ipcMain.on('wake-signal', () => {
  console.log('[electron] wake signal from renderer')
  showWindow()
  // Also forward to WebSocket so ws-server logs and relays it
  try { if (ws?.readyState === 1) ws.send('WAKE_SIGNAL') } catch {}
})

app.whenReady().then(() => {
  createWindow()
  createTray()
  connectWebSocket()
  console.log('[electron] Nova desktop running, tray active')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
