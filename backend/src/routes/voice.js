const express = require('express')
const crypto = require('crypto')
const { SupervisorGraph } = require('../agents/supervisor')
const { transcribe } = require('../tools/whisper')
const registry = require('../tools/registry')
const ttsService = require('../tts-service')

const router = express.Router()
const supervisor = new SupervisorGraph()

const FAST_INTENT = [
  { rx: /\b(?:wallet|balance|paystack|money|finance|payment|transaction)\b/i, intent: 'show_wallet', reply: 'Opening your wallet now.' },
  { rx: /\b(?:analytics|stats?|report|chart|marketing|performance|data)\b/i, intent: 'show_analytics', reply: 'Pulling up your analytics.' },
  { rx: /\b(?:backup|folder|directory|storage|export|document|file)\b/i, intent: 'show_backup', reply: 'Showing your files.' },
  { rx: /\b(?:hide|close|go\s*back|dismiss|return|clear)\b/i, intent: 'hide_overlay', reply: 'Closing the panel.' },
]

function detectFastIntent(text) {
  for (const entry of FAST_INTENT) {
    if (entry.rx.test(text)) return entry
  }
  return null
}

router.post('/', async (req, res) => {
  const tReq = Date.now()
  const { text } = req.body
  const requestId = crypto.randomUUID()
  console.log('[voice] requestId:', requestId, '| text:', typeof text === 'string' ? text.slice(0,200) : text)
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }
  try {
    const fast = detectFastIntent(text)
    let reply, intent
    if (fast) {
      intent = fast.intent
      reply = fast.reply
      registry.executeTool(intent, {}, intent).catch(() => {})
      console.log(`[timing] fast-path intent: ${intent} (${Date.now() - tReq}ms)`)
    } else {
      const tIntent = Date.now()
      const result = await supervisor.execute(text)
      intent = result.intent
      reply = result.reply
      console.log(`[timing] supervisor.execute: ${Date.now() - tIntent}ms | intent: ${intent || 'none'}`)
    }

    // ONLY the supervisor output is sent to TTS — single call, never duplicated
    const { audioId } = ttsService.speak(reply, requestId)

    console.log(`[timing] total request: ${Date.now() - tReq}ms`)
    res.json({ status: 'accepted', reply, audioId, intent, requestId })
  } catch (err) {
    console.error('[voice] pipeline error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/transcribe', async (req, res) => {
  const t0 = Date.now()
  const { audio, mimeType } = req.body
  const requestId = crypto.randomUUID()
  if (!audio) {
    return res.status(400).json({ error: 'audio is required' })
  }
  try {
    const transcript = await transcribe(audio, mimeType || 'audio/webm')
    console.log(`[timing] whisper transcribe: ${Date.now() - t0}ms`)

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'could not transcribe audio' })
    }

    const fast = detectFastIntent(transcript)
    let reply, intent
    if (fast) {
      intent = fast.intent
      reply = fast.reply
      registry.executeTool(intent, {}, intent).catch(() => {})
      console.log(`[timing] fast-path intent: ${intent} (${Date.now() - t0}ms)`)
    } else {
      const result = await supervisor.execute(transcript)
      intent = result.intent
      reply = result.reply
      console.log(`[timing] supervisor.execute: ${Date.now() - t0}ms | intent: ${intent || 'none'}`)
    }

    const { audioId } = ttsService.speak(reply, requestId)

    console.log(`[timing] total: ${Date.now() - t0}ms`)
    res.json({ status: 'accepted', transcript, reply, audioId, intent, requestId })
  } catch (err) {
    console.error('[voice] transcribe error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
