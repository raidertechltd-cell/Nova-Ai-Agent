const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE || '21m00Tcm4TlvDq8ikWAM'
const AUDIO_DIR = path.resolve(__dirname, '..', '..', 'data', 'audio')

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true })

function tts(text) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
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
        const elapsed = Date.now() - t0
        console.log(`[timing] ElevenLabs TTS: ${elapsed}ms (${text.length} chars)`)
        resolve(buf.toString('base64'))
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function ttsToFile(text, id) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    if (!id) id = crypto.randomBytes(8).toString('hex')
    const filePath = path.join(AUDIO_DIR, `${id}.mp3`)

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

    const file = fs.createWriteStream(filePath)
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errBody = ''
        res.on('data', (c) => errBody += c)
        res.on('end', () => {
          fs.unlink(filePath, () => {})
          console.error(`[tts] ElevenLabs ${res.statusCode}: ${errBody}`)
          resolve(null)
        })
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        const elapsed = Date.now() - t0
        console.log(`[timing] ElevenLabs TTS-to-file: ${elapsed}ms (${text.length} chars, ${id})`)
        resolve(id)
      })
    })
    req.on('error', (err) => {
      fs.unlink(filePath, () => {})
      console.error('[tts] request error:', err.message)
      resolve(null)
    })
    req.write(data)
    req.end()
  })
}

module.exports = { tts, ttsToFile }
