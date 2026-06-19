const https = require('https')

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET

function apiRequest(method, path, body) {
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

function getBalance() {
  return apiRequest('GET', '/balance')
}

function initializeTransaction(params) {
  return apiRequest('POST', '/transaction/initialize', params)
}

module.exports = { apiRequest, getBalance, initializeTransaction }
