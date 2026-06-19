require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const voice = require('./routes/voice')
const marketing = require('./routes/marketing')
const paystack = require('./routes/paystack')
const finance = require('./routes/finance')
const db = require('./db')
const memory = require('./memory')

const app = express()

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// capture raw body for webhook signature verification
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) req.rawBody = buf.toString(encoding || 'utf8')
}
app.use(bodyParser.json({ limit: '10mb', verify: rawBodySaver }))

app.use('/api/voice-command', voice)
app.use('/api/marketing', marketing)
app.use('/api/paystack', paystack)
app.use('/api/finance', finance)

app.get('/api/health', async (req, res) => {
  const recent = await memory.getRecent(3).catch(() => [])
  res.json({ ok: true, memory: { records: recent.length }, mode: 'supervisor-minion' })
})

const PORT = process.env.PORT || 4000

db.ready.then(async () => {
  // pre-warm: load AWS SDK modules into cache + resolve credentials eagerly
  // (eliminates module-loading and credential-resolution delays from first real request)
  const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK
  if (TOKEN) {
    try {
      const decoded = Buffer.from(TOKEN, 'base64').toString('utf-8')
      const colonIdx = decoded.indexOf(':')
      const AK = colonIdx > 0 ? decoded.slice(0, colonIdx) : ''
      const SK = colonIdx > 0 ? decoded.slice(colonIdx + 1) : ''
      // Force module loading (they stay in require cache)
      const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime')
      const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'eu-north-1', credentials: { accessKeyId: AK, secretAccessKey: SK } })
      // Force credential resolution (no API call, just resolves env/chain)
      await client.config.credentials()
      console.log('[warm] Bedrock client ready')
    } catch (_) { /* non-fatal */ }
  }

  app.listen(PORT, () => console.log('Nova backend listening on', PORT))
})
