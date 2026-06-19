require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const voice = require('./routes/voice')
const marketing = require('./routes/marketing')
const paystack = require('./routes/paystack')
const finance = require('./routes/finance')
const db = require('./db')

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

app.get('/api/health', (req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 4000
db.ready.then(() => app.listen(PORT, () => console.log('Nova backend listening on', PORT)))
