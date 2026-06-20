const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('novaDesktop', {
  isDesktop: true,
  sendWakeSignal: () => ipcRenderer.send('wake-signal'),

  // ── CUA: Screen & Vision ──
  screenshot: () => ipcRenderer.invoke('cua:screenshot'),

  // ── CUA: Mouse ──
  mouseMove: (x, y) => ipcRenderer.invoke('cua:mouse-move', { x, y }),
  mouseClick: (button, x, y) => ipcRenderer.invoke('cua:mouse-click', { button, x, y }),

  // ── CUA: Keyboard ──
  keyboardType: (text) => ipcRenderer.invoke('cua:keyboard-type', { text }),
  keyboardShortcut: (keys) => ipcRenderer.invoke('cua:keyboard-shortcut', { keys }),

  // ── CUA: Processes ──
  launchApp: (name, appPath) => ipcRenderer.invoke('cua:launch-app', { name, path: appPath }),
  listProcesses: () => ipcRenderer.invoke('cua:list-processes'),
  terminateProcess: (pid, name) => ipcRenderer.invoke('cua:terminate-process', { pid, name }),

  // ── CUA: Windows ──
  focusWindow: (title) => ipcRenderer.invoke('cua:focus-window', { title }),
  listWindows: () => ipcRenderer.invoke('cua:list-windows'),
})
