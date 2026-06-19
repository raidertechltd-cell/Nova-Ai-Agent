const express = require('express')
const crypto = require('crypto')
const https = require('https')
const router = express.Router()
const db = require('../db')

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET
if (!PAYSTACK_SECRET) console.warn('WARNING: PAYSTACK_SECRET not set in .env')

function paystackRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null
    const options = {
      hostname: 'api.paystack.co',
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    }
    if (data) options.headers['Content-Length'] = data.length

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        try {
          const parsed = JSON.parse(buf.toString())
          if (res.statusCode >= 400 || parsed.status === false) {
            return reject(new Error(parsed.message || `Paystack HTTP ${res.statusCode}`))
          }
          resolve(parsed)
        } catch {
          reject(new Error(`Paystack parse error: ${buf.toString().slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// Helper to persist transaction and update wallet
function persistTransaction(type, amount, currency, meta) {
  try {
    const stmt = db.prepare('INSERT INTO transactions (ts,type,amount,currency,meta) VALUES (datetime("now"),?,?,?,?)')
    const info = stmt.run(type, amount, currency, JSON.stringify(meta || {}))

    const existing = db.prepare('SELECT * FROM wallet WHERE currency = ?').get(currency)
    if (existing) {
      db.prepare('UPDATE wallet SET balance = ? WHERE currency = ?').run(existing.balance + amount, currency)
    } else {
      db.prepare('INSERT INTO wallet (currency,balance) VALUES (?,?)').run(currency, amount)
    }

    return info.lastInsertRowid
  } catch (e) {
    console.error('DB persist error', e)
    return null
  }
}

// Webhook receiver with HMAC verification
router.post('/webhook', (req, res) => {
  const signature = (req.get('x-paystack-signature') || req.get('X-Paystack-Signature') || '').trim()
  if (!signature) return res.status(400).send('missing signature')
  if (!PAYSTACK_SECRET) return res.status(500).send('paystack secret not configured')

  const raw = req.rawBody || JSON.stringify(req.body)
  const computed = crypto.createHmac('sha512', PAYSTACK_SECRET).update(raw).digest('hex')

  try {
    const sigBuf = Buffer.from(signature, 'hex')
    const compBuf = Buffer.from(computed, 'hex')
    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      console.warn('Invalid Paystack signature')
      return res.status(400).send('invalid signature')
    }
  } catch (e) {
    console.warn('Signature comparison failed', e)
    return res.status(400).send('signature error')
  }

  const event = req.body
  console.log('Paystack webhook verified:', event.event)

  // Basic processing: handle charge.success and transfer.success examples
  try {
    const evt = event.event || 'unknown'
    const data = event.data || {}
    const currency = data.currency || 'NGN'
    const amount = Number(data.amount || 0) // Paystack amount may be in kobo

    persistTransaction(evt, amount, currency, data)
    res.json({ received: true })
  } catch (err) {
    console.error('Webhook processing error', err)
    res.status(500).json({ ok: false })
  }
})

module.exports = router
