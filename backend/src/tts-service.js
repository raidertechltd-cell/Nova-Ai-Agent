const { ttsToFile } = require('./tools/elevenlabs')
const audioStore = require('./audio-store')
const crypto = require('crypto')

const completedRequests = new Set()

function speak(text, requestId) {
  if (!text || !requestId) return { audioId: null }

  if (completedRequests.has(requestId)) {
    console.log(`[tts-service] DUPLICATE BLOCKED for request ${requestId}`)
    return { audioId: null, blocked: true }
  }
  completedRequests.add(requestId)

  const audioId = crypto.randomBytes(6).toString('hex')
  audioStore.set(audioId, { ready: false })

  ttsToFile(text, audioId).then((id) => {
    if (id) {
      audioStore.set(audioId, { ready: true, url: `/api/audio/${audioId}.mp3` })
    }
  }).catch((err) => console.error('[tts-service] TTS failed:', err.message))

  return { audioId }
}

module.exports = { speak }
