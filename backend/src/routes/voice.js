const express = require('express')
const { SupervisorGraph } = require('../agents/supervisor')
const { tts } = require('../tools/elevenlabs')
const { transcribe } = require('../tools/whisper')

const router = express.Router()
const supervisor = new SupervisorGraph()

// Text-based voice command
router.post('/', async (req, res) => {
  const { text } = req.body
  console.log('[voice] received text:', typeof text === 'string' ? text.slice(0,200) : text)
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }
  try {
    const { reply, intent } = await supervisor.execute(text)
    let audio
    try { audio = await tts(reply) } catch (ttsErr) {
      console.error('ElevenLabs TTS error:', ttsErr.message)
    }
    res.json({ status: 'accepted', reply, audio, intent })
  } catch (err) {
    console.error('Supervisor pipeline error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Audio-based voice command (Whisper → Supervisor → ElevenLabs)
router.post('/transcribe', async (req, res) => {
  const { audio, mimeType } = req.body
  if (!audio) {
    return res.status(400).json({ error: 'audio is required' })
  }
  try {
    const transcript = await transcribe(audio, mimeType || 'audio/webm')
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'could not transcribe audio' })
    }
    const { reply, intent } = await supervisor.execute(transcript)
    let audioReply
    try { audioReply = await tts(reply) } catch (ttsErr) {
      console.error('ElevenLabs TTS error:', ttsErr.message)
    }
    res.json({ status: 'accepted', transcript, reply, audio: audioReply, intent })
  } catch (err) {
    console.error('Transcribe error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
