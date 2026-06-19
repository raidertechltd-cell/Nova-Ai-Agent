const https = require('https')
const fs = require('fs')
const path = require('path')

const TOKEN = process.env.VERCEL_API_TOKEN
const PROJECT_ID = process.env.VERCEL_PROJECT_ID
const DIR = path.resolve(__dirname, 'frontend', 'dist')

function readFiles(dir) {
  const files = []
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      const rel = path.relative(DIR, p).replace(/\\/g, '/')
      const data = fs.readFileSync(p, 'base64')
      files.push({ file: rel, data, encoding: 'base64' })
    }
  }
  walk(dir)
  return files
}

const files = readFiles(DIR)
console.log('Uploading', files.length, 'files from dist...')

const body = JSON.stringify({
  name: 'nova-ai',
  project: PROJECT_ID,
  files,
  target: 'production',
})

const options = {
  hostname: 'api.vercel.com',
  path: '/v13/deployments',
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}

const req = https.request(options, (res) => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => {
    const result = JSON.parse(Buffer.concat(chunks).toString())
    if (res.statusCode === 200) {
      console.log('DEPLOYED:', result.url || 'unknown')
      console.log('STATE:', result.readyState)
      console.log('ID:', result.id)
    } else {
      console.error('ERROR:', res.statusCode, JSON.stringify(result).substring(0, 500))
    }
  })
})

req.on('error', (e) => console.error('FAILED:', e.message))
req.write(body)
req.end()
