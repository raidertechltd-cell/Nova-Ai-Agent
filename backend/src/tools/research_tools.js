const https = require('https')

function httpsGet(hostname, path) {
  return new Promise((resolve, reject) => {
    const opts = { hostname, path, method: 'GET', headers: { 'User-Agent': 'Nova-AI/1.0' } }
    const req = https.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString()))
    })
    req.on('error', reject)
    req.end()
  })
}

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

async function duckDuckGoSearch(query) {
  const html = await httpsGet('html.duckduckgo.com', `/html/?q=${encodeURIComponent(query)}`)
  // Extract results from the HTML page
  const results = []
  const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let match
  let count = 0
  while ((match = resultRegex.exec(html)) !== null && count < 5) {
    const url = match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&rut=.*$/, '')
    results.push({
      title: match[2].replace(/<[^>]+>/g, '').trim(),
      url: decodeURIComponent(url),
      snippet: match[3].replace(/<[^>]+>/g, '').trim(),
    })
    count++
  }
  return {
    status: 'success',
    source: 'duckduckgo',
    data: results,
  }
}

async function performWebSearch(query) {
  if (!query || !query.trim()) {
    return { status: 'error', message: 'Query is required.' }
  }
  // Try Tavily first (requires TAVILY_API_KEY)
  if (process.env.TAVILY_API_KEY) {
    try { return await tavilySearch(query) } catch (e) { console.error('[web] Tavily failed:', e.message) }
  }
  // Try Serper second (requires SERPER_API_KEY)
  if (process.env.SERPER_API_KEY) {
    try { return await serperSearch(query) } catch (e) { console.error('[web] Serper failed:', e.message) }
  }
  // Fallback to DuckDuckGo — free, no API key needed
  try {
    const result = await duckDuckGoSearch(query)
    if (result.data.length > 0) return result
  } catch (e) { console.error('[web] DuckDuckGo failed:', e.message) }
  return { status: 'error', message: 'Web search unavailable. No search API configured and free fallback failed.' }
}

module.exports = { performWebSearch }
