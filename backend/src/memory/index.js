const db = require('../db')
const embeddingCache = new Map()

let initialized = false

function ensureTable() {
  if (initialized) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS nova_memory (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      embedding TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
  initialized = true
}

const HAS_EMBEDDING_KEY = !!process.env.OPENAI_API_KEY

function computeEmbedding(text) {
  if (!HAS_EMBEDDING_KEY) return null
  if (embeddingCache.has(text)) return embeddingCache.get(text)

  return new Promise((resolve) => {
    const https = require('https')
    const payload = JSON.stringify({ model: 'text-embedding-3-small', input: text })
    const opts = {
      hostname: 'api.openai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    }

    const req = https.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          const emb = data.data?.[0]?.embedding || null
          if (emb) embeddingCache.set(text, emb)
          resolve(emb)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.write(payload)
    req.end()
  })
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function save(text, metadata = {}) {
  ensureTable()
  const id = 'mem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  const embedding = HAS_EMBEDDING_KEY ? await computeEmbedding(text) : null
  const embeddingStr = embedding ? JSON.stringify(embedding) : null
  db.prepare(
    'INSERT OR REPLACE INTO nova_memory (id, text, embedding, metadata) VALUES (?,?,?,?)'
  ).run(id, text, embeddingStr, JSON.stringify(metadata))
  return id
}

async function query(queryText, topK = 5) {
  ensureTable()
  const queryEmbedding = HAS_EMBEDDING_KEY ? await computeEmbedding(queryText) : null

  if (queryEmbedding) {
    // Semantic search
    const rows = db.prepare('SELECT * FROM nova_memory ORDER BY id DESC').all()
    const scored = rows.map((r) => {
      let score = 0
      if (r.embedding) {
        try {
          const emb = JSON.parse(r.embedding)
          score = cosineSimilarity(queryEmbedding, emb)
        } catch {}
      }
      return { ...r, score, embedding: undefined }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  } else {
    // Fallback: keyword match
    const rows = db.prepare(
      'SELECT * FROM nova_memory WHERE text LIKE ? OR metadata LIKE ? ORDER BY created_at DESC LIMIT ?'
    ).all(`%${queryText}%`, `%${queryText}%`, topK)
    return rows.map((r) => ({ ...r, score: 0, embedding: undefined }))
  }
}

async function getRecent(limit = 10) {
  ensureTable()
  return db.prepare('SELECT id, text, metadata, created_at FROM nova_memory ORDER BY created_at DESC LIMIT ?').all(limit)
}

function clear() {
  ensureTable()
  db.exec('DELETE FROM nova_memory')
}

module.exports = { save, query, getRecent, clear, computeEmbedding }
