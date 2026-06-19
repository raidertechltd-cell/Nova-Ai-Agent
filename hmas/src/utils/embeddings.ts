import https from 'https'

export async function computeEmbedding(text: string): Promise<number[] | undefined> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // No key: return undefined so callers can fallback
    return undefined
  }

  // Call OpenAI embeddings endpoint (text-embedding-3-small or similar)
  const payload = JSON.stringify({ model: 'text-embedding-3-small', input: text })

  const opts = {
    hostname: 'api.openai.com',
    path: '/v1/embeddings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: `Bearer ${apiKey}`,
    },
  }

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString()
          const data = JSON.parse(body)
          const emb = data.data?.[0]?.embedding
          resolve(emb)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
