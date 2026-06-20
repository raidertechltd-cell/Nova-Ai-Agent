const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, session, desktopCapturer } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec, spawn } = require('child_process')
const { performance } = require('perf_hooks')

const WS_PORT = process.env.WS_PORT || 4001
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend-snowy-sigma-30.vercel.app'
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

// ── CUA: Screen Capture ──
ipcMain.handle('cua:screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } })
    if (!sources.length) return { error: 'no screen sources' }
    const img = sources[0].thumbnail.toDataURL()
    return { data: img }
  } catch (e) {
    return { error: e.message }
  }
})

// ── CUA: Mouse Control (via PowerShell — no native deps) ──
function psExec(script) {
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 10000 }, (err, stdout) => {
      if (err) return reject(err)
      resolve(stdout.trim())
    })
  })
}

ipcMain.handle('cua:mouse-move', async (_, { x, y }) => {
  try {
    await psExec(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})`)
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('cua:mouse-click', async (_, { button, x, y }) => {
  try {
    const btn = button === 'right' ? 'Right' : 'Left'
    if (x !== undefined && y !== null && y !== undefined && x !== null) {
      await psExec(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})`)
    }
    await psExec(`
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -Name Win32 -MemberDefinition @"
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
"@
      $btn = 0x0002; $up = 0x0004
      if ('${btn}' -eq 'Right') { $btn = 0x0008; $up = 0x0010 }
      [Win32]::mouse_event($btn, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 50
      [Win32]::mouse_event($up, 0, 0, 0, 0)
    `.trim().replace(/\n\s*/g, '; '))
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

// ── CUA: Keyboard Control (via PowerShell) ──
ipcMain.handle('cua:keyboard-type', async (_, { text }) => {
  try {
    const escaped = text.replace(/'/g, "''")
    await psExec(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${escaped}')
    `.trim().replace(/\n\s*/g, '; '))
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('cua:keyboard-shortcut', async (_, { keys }) => {
  try {
    const keyMap = {
      control: '^', ctrl: '^', alt: '%', shift: '+',
      tab: '{TAB}', enter: '~', escape: '{ESC}', space: ' ',
      backspace: '{BACKSPACE}', delete: '{DELETE}',
      up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
      home: '{HOME}', end: '{END}', pgup: '{PGUP}', pgdn: '{PGDN}',
      f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}',
      f6: '{F6}', f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}',
      f11: '{F11}', f12: '{F12}',
    }
    const parts = keys.split('+').map(k => keyMap[k.trim().toLowerCase()] || k.trim())
    const sendKeys = parts.map(p => p.length === 1 && !p.startsWith('{') && !p.startsWith('^') && !p.startsWith('%') && !p.startsWith('+') ? p : p).join('')
    await psExec(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${sendKeys.replace(/'/g, "''")}')
    `.trim().replace(/\n\s*/g, '; '))
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

// ── CUA: Process Management ──
ipcMain.handle('cua:launch-app', async (_, { name, path: appPath }) => {
  try {
    const target = appPath || name
    spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('cua:list-processes', async () => {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV /NH', (err, stdout) => {
      if (err) return resolve({ error: err.message })
      const lines = stdout.trim().split('\n').slice(0, 50)
      const processes = lines.map(l => {
        const parts = l.replace(/"/g, '').split(',')
        return { name: parts[0], pid: parseInt(parts[1]), session: parts[2], mem: parts[4] }
      }).filter(p => p.name)
      resolve({ processes })
    })
  })
})

ipcMain.handle('cua:terminate-process', async (_, { pid, name }) => {
  try {
    if (pid) { process.kill(pid); return { ok: true } }
    if (name) { exec(`taskkill /IM "${name}" /F`, () => {}); return { ok: true } }
    return { error: 'provide pid or name' }
  } catch (e) {
    return { error: e.message }
  }
})

// ── CUA: Window Management ──
ipcMain.handle('cua:focus-window', async (_, { title }) => {
  try {
    exec(`powershell -Command "(New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.LocationName -like '*${title}*' } | ForEach-Object { $_.Visible = $true; $_.Focus() }"`, () => {})
    // Fallback: use ALT+TAB style via window title match
    exec(`powershell -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('${title}')"`, () => {})
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('cua:list-windows', async () => {
  return new Promise((resolve) => {
    exec('powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-JSON"', (err, stdout) => {
      if (err) return resolve({ error: err.message })
      try { resolve({ windows: JSON.parse(stdout) }) } catch { resolve({ windows: [] }) }
    })
  })
})

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0, y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreen: !DEV,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Make clicks pass through when not interacting with widgets
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

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
