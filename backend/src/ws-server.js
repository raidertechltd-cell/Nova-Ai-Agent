const WebSocket = require('ws')
const http = require('http')

const PORT = process.env.WS_PORT || 4001

function startWsServer() {
  const server = http.createServer()
  const wss = new WebSocket.Server({ server })

  wss.on('connection', (ws) => {
    console.log('[ws] client connected')
    ws.on('message', (msg) => {
      try {
        const data = typeof msg === 'string' ? msg : msg.toString()
        console.log('[ws] message:', data)
        if (data === 'WAKE_SIGNAL') {
          // Broadcast to all other connected clients (Electron, etc.)
          console.log('[ws] WAKE_SIGNAL received, broadcasting')
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send('WAKE_SIGNAL')
            }
          })
        }
      } catch (e) {
        console.error('[ws] message parse error', e.message)
      }
    })
  })

  server.listen(PORT, () => console.log('[ws] WebSocket server listening on', PORT))

  return { server, wss }
}

module.exports = { startWsServer }
