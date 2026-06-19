const express = require('express')
const https = require('https')
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')

const router = express.Router()

const REGION = process.env.AWS_REGION || 'eu-north-1'
const MODEL_ID = process.env.BEDROCK_MODEL || 'eu.amazon.nova-micro-v1:0'

const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK
const decoded = TOKEN ? Buffer.from(TOKEN, 'base64').toString('utf-8') : ''
const colonIdx = decoded.indexOf(':')
const ACCESS_KEY = colonIdx > 0 ? decoded.slice(0, colonIdx) : ''
const SECRET_KEY = colonIdx > 0 ? decoded.slice(colonIdx + 1) : ''

const bedrock = new BedrockRuntimeClient({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
})

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE || '21m00Tcm4TlvDq8ikWAM'

// ── Tool definitions for Bedrock function calling ──
const TOOLS = [
  {
    toolSpec: {
      name: 'show_wallet',
      description: 'Show the user their wallet/financial information including balances and transactions',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'show_analytics',
      description: 'Show analytics dashboard with stats, charts, and marketing data',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'show_backup',
      description: 'Show backup files, documents, folders, and storage information',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'hide_overlay',
      description: 'Close or hide the currently displayed overlay panel and return to the main idle view',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
]

const SYSTEM_PROMPT = `You are Nova, an AI workspace assistant with a voice-first interface.
Respond conversationally, warmly, and briefly (1-2 short sentences).
Never include tags like <thinking> or markdown in your response.
You have access to tools that control the UI. When the user's request matches a tool, USE IT.
If no tool is needed, respond naturally without calling any tool.

Available tools:
- show_wallet: finances, balance, paystack, payments, transactions, money
- show_analytics: stats, analytics, marketing, data, reports, charts, performance
- show_backup: files, backup, storage, folders, documents, exports
- hide_overlay: go back, close, hide, return to home, clear, dismiss

Always respond in a natural, empathetic tone.`

function elevenTTS(text) {
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

const INTENT_REPLIES = {
  SHOW_WALLET: 'Sure, let me pull up your wallet information.',
  SHOW_ANALYTICS: 'Here are your analytics and stats.',
  SHOW_BACKUP: 'Opening your files and backups.',
  HIDE_DASHBOARD: 'Closing the panel. Let me know if you need anything else.',
}

const INTENT_MAP = {
  show_wallet: 'SHOW_WALLET',
  show_analytics: 'SHOW_ANALYTICS',
  show_backup: 'SHOW_BACKUP',
  hide_overlay: 'HIDE_DASHBOARD',
}

function stripThinking(text) {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(/<result>[\s\S]*?<\/result>/g, '').trim()
}

async function bedrockReply(text) {
  const cmd = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ text }] }],
    toolConfig: {
      tools: TOOLS,
      toolChoice: { auto: {} },
    },
    inferenceConfig: { maxTokens: 1024 },
  })

  const response = await bedrock.send(cmd)
  const content = response.output?.message?.content || []

  // Extract tool use
  const toolBlock = content.find((c) => c.toolUse)
  let intent = null
  if (toolBlock?.toolUse) {
    intent = INTENT_MAP[toolBlock.toolUse.name] || null
  }

  // Extract text response, avoiding thinking-only replies
  const textBlock = content.find((c) => c.text)
  let reply = textBlock?.text ? stripThinking(textBlock.text) : ''

  // If reply is empty or only thinking tags, use intent default or fallback
  if (!reply && intent) {
    reply = INTENT_REPLIES[intent] || 'Got it.'
  }
  if (!reply) {
    reply = 'Got it.'
  }

  return { reply, intent }
}

function whisperTranscribe(audioBase64, mimeType) {
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

// Text-based voice command
router.post('/', async (req, res) => {
  const { text } = req.body
  console.log('[voice] received text:', typeof text === 'string' ? text.slice(0,200) : text)
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }
  try {
    const { reply, intent } = await bedrockReply(text)
    let audio
    try { audio = await elevenTTS(reply) } catch (ttsErr) {
      console.error('ElevenLabs TTS error:', ttsErr.message)
    }
    res.json({ status: 'accepted', reply, audio, intent })
  } catch (err) {
    console.error('Bedrock error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Audio-based voice command (Whisper → Bedrock → ElevenLabs)
router.post('/transcribe', async (req, res) => {
  const { audio, mimeType } = req.body
  if (!audio) {
    return res.status(400).json({ error: 'audio is required' })
  }
  try {
    const transcript = await whisperTranscribe(audio, mimeType || 'audio/webm')
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'could not transcribe audio' })
    }
    const { reply, intent } = await bedrockReply(transcript)
    let audioReply
    try { audioReply = await elevenTTS(reply) } catch (ttsErr) {
      console.error('ElevenLabs TTS error:', ttsErr.message)
    }
    res.json({ status: 'accepted', transcript, reply, audio: audioReply, intent })
  } catch (err) {
    console.error('Transcribe error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
