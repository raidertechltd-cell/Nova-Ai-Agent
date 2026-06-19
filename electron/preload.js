const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('novaDesktop', {
  sendWakeSignal: () => ipcRenderer.send('wake-signal'),
  isDesktop: true,
})
