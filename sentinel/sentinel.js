const WebSocket = require('ws')
const { spawn } = require('child_process')

const WS_HOST = process.env.WS_HOST || 'localhost'
const WS_PORT = parseInt(process.env.WS_PORT || '4001', 10)
const DEBUG = process.argv.includes('--debug')
const CLAP_THRESHOLD = 0.25
const CLAP_COOLDOWN = 2000

let lastClapTime = 0
let micInstance = null
let psProcess = null
let ws

function log(...args) { if (DEBUG) console.log('[sentinel]', ...args) }

function connectWS() {
  ws = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`)
  ws.on('open', () => log('connected to backend WS'))
  ws.on('error', () => {})
  ws.on('close', () => {
    log('disconnected, retry in 5s')
    setTimeout(connectWS, 5000)
  })
}

function sendWake() {
  const now = Date.now()
  if (now - lastClapTime < CLAP_COOLDOWN) return
  lastClapTime = now
  log('WAKE_SIGNAL sent')
  try { ws.send('WAKE_SIGNAL') } catch {}
}

function startMic() {
  try {
    const Mic = require('mic')
    micInstance = Mic({ rate: 16000, channels: 1, debug: DEBUG, exitOnSilence: 6 })
    const stream = micInstance.getAudioStream()
    let buf = Buffer.alloc(0)

    stream.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      while (buf.length >= 1024) {
        const frame = buf.slice(0, 1024)
        buf = buf.slice(1024)
        let sum = 0
        for (let i = 0; i < frame.length; i += 2) {
          const s = frame.readInt16LE(i) / 32768
          sum += s * s
        }
        if (Math.sqrt(sum / 512) > CLAP_THRESHOLD) sendWake()
      }
    })
    stream.on('error', (e) => console.error('[sentinel] mic error:', e.message))
    micInstance.start()
    log('mic audio capture active')
    return true
  } catch (e) {
    console.warn('[sentinel] mic unavailable:', e.message)
    return false
  }
}

function startPowerShell() {
  try {
    psProcess = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', require('path').join(__dirname, 'monitor.ps1'),
      '-Port', String(WS_PORT),
      '-Host', WS_HOST,
      '-Threshold', String(CLAP_THRESHOLD),
      '-CooldownMs', String(CLAP_COOLDOWN),
    ], { stdio: DEBUG ? 'inherit' : 'ignore' })
    psProcess.on('exit', (code) => {
      log(`PS monitor exited (${code}), restarting in 10s`)
      setTimeout(startPowerShell, 10000)
    })
    log('PowerShell audio monitor started')
    return true
  } catch (e) {
    console.warn('[sentinel] PowerShell monitor failed:', e.message)
    return false
  }
}

connectWS()
if (!startMic()) {
  console.log('[sentinel] No native audio backend — running in relay-only mode.')
  console.log('[sentinel] Install SoX (sox.sourceforge.net) then run: npm install mic')
  console.log('[sentinel] Or use monitor.ps1 for basic detection.')
}

process.on('SIGINT', () => { if (micInstance) micInstance.stop(); if (psProcess) psProcess.kill(); process.exit() })
process.on('SIGTERM', () => { if (micInstance) micInstance.stop(); if (psProcess) psProcess.kill(); process.exit() })

log(`Sentinel active on ws://${WS_HOST}:${WS_PORT}`)
