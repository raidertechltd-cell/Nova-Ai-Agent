const express = require('express')
const https = require('https')
const router = express.Router()
const db = require('../db')

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY

function paystackRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      path,
      method,
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
    }
    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { reject(new Error('parse error')) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// Wallet overview: local balances + Paystack live data
router.get('/wallet', async (req, res) => {
  try {
    // Local data
    const localBalances = db.prepare('SELECT currency, balance FROM wallet').all()
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT 50').all()

    // Paystack live balance
    let paystackBalance = []
    try {
      const ps = await paystackRequest('GET', '/balance')
      paystackBalance = ps.data || []
    } catch {}

    res.json({
      balances: localBalances,
      paystack: paystackBalance,
      transactions,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Virtual account info
router.get('/virtual-account', (req, res) => {
  const account = db.prepare("SELECT * FROM wallet WHERE currency='VIRTUAL'").get()
  res.json(account || { bank: 'Wema Bank', number: '0123456789', name: 'Nova AI User' })
})

module.exports = router
