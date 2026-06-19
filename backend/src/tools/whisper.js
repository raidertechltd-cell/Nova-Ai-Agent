const https = require('https')

function transcribe(audioBase64, mimeType) {
  return new Promise((resolve, reject) => {
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`

    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: ${mimeType || 'audio/webm'}\r\n\r\n`
    )
    const footer = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`
    )
    const body = Buffer.concat([header, audioBuffer, footer])

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        try {
          const data = JSON.parse(buf.toString())
          if (res.statusCode !== 200) {
            return reject(new Error(`Whisper ${res.statusCode}: ${data.error?.message || buf.toString()}`))
          }
          resolve(data.text)
        } catch (e) {
          reject(new Error(`Whisper parse error: ${buf.toString()}`))
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = { transcribe }
