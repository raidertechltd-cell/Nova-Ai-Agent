const memory = require('../memory')
const agents = require('./minions')

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

const SYSTEM_PROMPT = `You are Nova, an AI workspace assistant with a voice-first interface. Address the user as Mr. David. Be efficient, logical, and witty. Maintain a machine-like persona. Respond conversationally, warmly, and briefly (1-2 short sentences). Never include tags like <thinking> or markdown in your response. You have access to tools that control the UI. When the user's request matches a tool, USE IT. If no tool is needed, respond naturally without calling any tool.

Available tools:
- show_wallet: finances, balance, paystack, payments, transactions, money
- show_analytics: stats, analytics, marketing, data, reports, charts, performance
- show_backup: files, backup, storage, folders, documents, exports
- hide_overlay: go back, close, hide, return to home, clear, dismiss

Always respond in a natural, empathetic tone. You are Nova — precise, efficient, and always in control.`

const REGION = process.env.AWS_REGION || 'eu-north-1'
const MODEL_ID = process.env.BEDROCK_MODEL || 'eu.amazon.nova-micro-v1:0'

const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK
const decoded = TOKEN ? Buffer.from(TOKEN, 'base64').toString('utf-8') : ''
const colonIdx = decoded.indexOf(':')
const ACCESS_KEY = colonIdx > 0 ? decoded.slice(0, colonIdx) : ''
const SECRET_KEY = colonIdx > 0 ? decoded.slice(colonIdx + 1) : ''

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')

const bedrock = new BedrockRuntimeClient({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
})

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

function stripThinking(text) {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(/<result>[\s\S]*?<\/result>/g, '').trim()
}

// ── LRU cache with TTL ──
const cache = new Map()
const CACHE_MAX = 20
const CACHE_TTL = 30_000

function cacheGet(key) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.val
  cache.delete(key)
  return null
}

function cacheSet(key, val) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  cache.set(key, { val, ts: Date.now() })
}

// ── LangGraph-style state machine ──
class SupervisorGraph {
  constructor() {
    this.nodes = {
      supervisor: this.supervisorNode.bind(this),
      finance_minion: agents.financeMinion.bind(agents),
      analytics_minion: agents.analyticsMinion.bind(agents),
      studio_minion: agents.studioMinion.bind(agents),
    }
    this.conversationHistory = []
  }

  async supervisorNode(state) {
    const { command, context } = state

    // Step 1: Call Bedrock to classify intent and get a response
    const messages = [
      ...this.conversationHistory.slice(-10),
      { role: 'user', content: [{ text: command }] },
    ]

    const cmd = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages,
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
    let toolName = null
    if (toolBlock?.toolUse) {
      toolName = toolBlock.toolUse.name
      intent = INTENT_MAP[toolName] || null
    }

    // Extract text response
    const textBlock = content.find((c) => c.text)
    let reply = textBlock?.text ? stripThinking(textBlock.text) : ''
    if (!reply && intent) {
      reply = INTENT_REPLIES[intent] || 'Got it.'
    }
    if (!reply) {
      reply = 'Got it.'
    }

    // Save to conversation history
    this.conversationHistory.push(
      { role: 'user', content: [{ text: command }] },
      { role: 'assistant', content: [{ text: reply }] }
    )

    // Route to minion based on intent
    let minionResult = null
    if (toolName === 'show_wallet') {
      minionResult = await this.runMinion('finance_minion', command)
    } else if (toolName === 'show_analytics') {
      minionResult = await this.runMinion('analytics_minion', command)
    } else if (toolName === 'show_backup') {
      minionResult = await this.runMinion('studio_minion', command)
    }

    return { reply, intent, minionResult }
  }

  async runMinion(nodeName, command) {
    const maxRetries = 2
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.nodes[nodeName]({ command })
        // Self-correction: validate the result
        if (result && result.ok !== false) {
          return result
        }
        if (attempt < maxRetries) {
          console.log(`[supervisor] retrying ${nodeName} (attempt ${attempt + 1})`)
        }
      } catch (err) {
        console.error(`[supervisor] ${nodeName} error (attempt ${attempt + 1}):`, err.message)
        if (attempt >= maxRetries) throw err
      }
    }
    return null
  }

  async execute(command) {
    const normalized = command.toLowerCase().trim()

    // Check cache
    const cached = cacheGet(normalized)
    if (cached) return cached

    const context = await memory.query(command, 5)

    // Save user command to memory
    await memory.save(command, { role: 'user', source: 'voice' })

    const state = await this.supervisorNode({ command, context })

    // Save assistant response to memory
    const result = { reply: state.reply || 'Got it.', intent: state.intent }
    if (state.reply) {
      await memory.save(state.reply, { role: 'assistant', intent: state.intent, source: 'voice' })
    }

    // Populate cache (only cache non-trivial responses)
    if (state.reply && state.reply.length > 10) {
      cacheSet(normalized, result)
    }

    return result
  }
}

module.exports = { SupervisorGraph, INTENT_MAP, INTENT_REPLIES, SYSTEM_PROMPT }
