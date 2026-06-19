const https = require('https')

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE || '21m00Tcm4TlvDq8ikWAM'

function tts(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: 'eleven_flash_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.5 },
    })
    const data = Buffer.from(body)

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${ELEVEN_VOICE}`,
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_KEY,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        if (res.statusCode !== 200) {
          return reject(new Error(`ElevenLabs ${res.statusCode}: ${buf.toString()}`))
        }
        resolve(buf.toString('base64'))
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

module.exports = { tts }
