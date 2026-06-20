const express = require('express')
const crypto = require('crypto')
const { SupervisorGraph } = require('../agents/supervisor')
const { transcribe } = require('../tools/whisper')
const taskQueue = require('../task-queue')
const ttsService = require('../tts-service')

const router = express.Router()
const supervisor = new SupervisorGraph()

function isStandDown(text) {
  return /\bstand\s*down\b/i.test(text)
}

router.post('/', async (req, res) => {
  const tReq = Date.now()
  const { text } = req.body
  const requestId = crypto.randomUUID()
  console.log('[voice] requestId:', requestId, '| text:', typeof text === 'string' ? text.slice(0,200) : text)
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  // Emergency Override: Nova, Stand Down
  if (isStandDown(text)) {
    taskQueue.cancelAll()
    const reply = 'Standing down, sir.'
    const { audioId } = ttsService.speak(reply, requestId)
    return res.json({ status: 'accepted', reply, audioId, intent: 'stand_down', requestId })
  }

  try {
    const result = await supervisor.execute(text)

    const widgetData = result.toolResult?.widget || null

    const { audioId } = ttsService.speak(result.reply, requestId)

    console.log(`[timing] total request: ${Date.now() - tReq}ms`)
    res.json({ status: 'accepted', reply: result.reply, audioId, intent: result.intent, requestId, widget: widgetData, taskId: result.taskId })
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

    // Emergency Override: Nova, Stand Down
    if (isStandDown(transcript)) {
      const reply = 'Standing down, sir.'
      const { audioId } = ttsService.speak(reply, requestId)
      return res.json({ status: 'accepted', transcript, reply, audioId, intent: 'stand_down', requestId })
    }
    console.log(`[timing] whisper transcribe: ${Date.now() - t0}ms`)

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'could not transcribe audio' })
    }

    const result = await supervisor.execute(transcript)

    const widgetData = result.toolResult?.widget || null

    const { audioId } = ttsService.speak(result.reply, requestId)

    console.log(`[timing] total: ${Date.now() - t0}ms`)
    res.json({ status: 'accepted', transcript, reply: result.reply, audioId, intent: result.intent, requestId, widget: widgetData, taskId: result.taskId })
  } catch (err) {
    console.error('[voice] transcribe error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/task-status/:id', (req, res) => {
  const status = taskQueue.getStatus(req.params.id)
  if (!status) return res.status(404).json({ error: 'task not found' })
  res.json(status)
})

router.get('/tasks', (req, res) => {
  res.json({ active: taskQueue.listActive(), recent: taskQueue.listRecent(20) })
})

module.exports = router
