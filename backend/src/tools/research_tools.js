const https = require('https')

function httpsPost(hostname, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body))
    const opts = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        Authorization: `Bearer ${apiKey}`,
      },
    }
    const req = https.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch {
          reject(new Error('parse error'))
        }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function tavilySearch(query) {
  const data = await httpsPost('api.tavily.com', '/search', process.env.TAVILY_API_KEY, {
    query,
    search_depth: 'basic',
    max_results: 5,
  })
  return {
    status: 'success',
    source: 'tavily',
    data: (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || r.snippet,
    })),
  }
}

async function serperSearch(query) {
  const data = await httpsPost('google.serper.dev', '/search', process.env.SERPER_API_KEY, { q: query })
  return {
    status: 'success',
    source: 'serper',
    data: (data.organic || []).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    })),
  }
}

async function performWebSearch(query) {
  if (!query || !query.trim()) {
    return { status: 'error', message: 'Query is required.' }
  }
  if (process.env.TAVILY_API_KEY) {
    return await tavilySearch(query)
  }
  if (process.env.SERPER_API_KEY) {
    return await serperSearch(query)
  }
  return { status: 'error', message: 'No web search API configured. Set TAVILY_API_KEY or SERPER_API_KEY in .env' }
}

module.exports = { performWebSearch }
