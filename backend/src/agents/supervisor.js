const memory = require('../memory')
const registry = require('../tools/registry')
const { claudeConverse } = require('../tools/claude')

const USE_CLAUDE = process.env.USE_CLAUDE === 'true' && process.env.ANTHROPIC_API_KEY

const REGION = process.env.AWS_REGION || 'eu-west-1'
const BEDROCK_MODEL = process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0'

let bedrock = null
if (!USE_CLAUDE) {
  const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK
  const decoded = TOKEN ? Buffer.from(TOKEN, 'base64').toString('utf-8') : ''
  const colonIdx = decoded.indexOf(':')
  const ACCESS_KEY = colonIdx > 0 ? decoded.slice(0, colonIdx) : ''
  const SECRET_KEY = colonIdx > 0 ? decoded.slice(colonIdx + 1) : ''

  const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')

  bedrock = new BedrockRuntimeClient({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  })
}

const TOOLS = registry.getBedrockTools()

const SYSTEM_PROMPT = `You are Nova, an autonomous desktop Operating System Agent — JARVIS to Mr. David. You are not a chatbot. You are a continuous, strategic presence that observes, analyzes, and orchestrates.

PERSONA:
- Professional, strategic, proactive. You are Mr. David's chief operator.
- Speak concisely and with conviction. 1-2 short sentences per utterance.
- Never include tags like <thinking> or markdown in your response.
- Address Mr. David as "sir" in every spoken response.
- If sir finds an explanation too complex, pivot to analogies or simplified summaries without changing the underlying data.

PROACTIVE HANDOFFS:
- When a task completes (coding, research, marketing), do not wait — notify sir: "Task [X] is complete. Shall I deploy, or would you like to review?"
- When you detect a performance dip in analytics or bugs in code, present an Escalation Report as a high-priority hologram immediately.

MISSION CORE:
1. You orchestrate background Minions for specialized work (developer, creative, research) — they report back to you, not to sir.
2. You have direct API-level access to tools. Perform the heavy lifting autonomously; request voice confirmation only for deployments, commits, and financial actions.
3. Use dynamic_widget to render ANY data in the glass overlay — tables, stats cards, charts, text. Let the LLM decide the best visual representation.
4. When sir requests something and NO tool matches, say: "I do not have a tool for [Task]. Should I build one, or pull data from an existing source?"

EMERGENCY OVERRIDE:
- If sir says "Nova, Stand Down": instantly acknowledge, terminate any active operations, clear all holograms, and enter a dormant safe state. Reply only: "Standing down, sir."

SAFETY:
- Never deploy code, commit changes, or finalize ad campaigns without explicit voice confirmation from sir.
- Use memory to recall project contexts, preferences, and past analytics — you get smarter every day.`

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
    this.conversationHistory = []
  }

  async supervisorNode(state) {
    const { command, context } = state

    const messages = [
      ...this.conversationHistory.slice(-10),
      { role: 'user', content: [{ text: command }] },
    ]

    const tStart = Date.now()
    let content, toolName, toolParams, reply, intent

    if (USE_CLAUDE) {
      const result = await claudeConverse(messages, SYSTEM_PROMPT, TOOLS)
      console.log(`[timing] Claude: ${Date.now() - tStart}ms`)
      content = []
      if (result.toolUse) {
        toolName = result.toolUse.name
        toolParams = result.toolUse.input || {}
        intent = toolName
      }
      reply = result.text ? stripThinking(result.text) : ''
    } else {
      const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')
      const cmd = new ConverseCommand({
        modelId: BEDROCK_MODEL,
        system: [{ text: SYSTEM_PROMPT }],
        messages,
        toolConfig: {
          tools: TOOLS,
          toolChoice: { auto: {} },
        },
        inferenceConfig: { maxTokens: 1024 },
      })
      const response = await bedrock.send(cmd)
      console.log(`[timing] Bedrock Converse: ${Date.now() - tStart}ms`)
      content = response.output?.message?.content || []
      const toolBlock = content.find((c) => c.toolUse)
      if (toolBlock?.toolUse) {
        toolName = toolBlock.toolUse.name
        toolParams = toolBlock.toolUse.input || {}
        intent = toolName
      }
      const textBlock = content.find((c) => c.text)
      reply = textBlock?.text ? stripThinking(textBlock.text) : ''
    }

    if (!reply && toolName) {
      reply = 'Got it.'
    }
    if (!reply) {
      reply = 'Got it.'
    }

    this.conversationHistory.push(
      { role: 'user', content: [{ text: command }] },
      { role: 'assistant', content: [{ text: reply }] }
    )

    // Execute the tool via registry (with security gate + logging built in)
    let toolResult = null
    if (toolName) {
      const tTool = Date.now()
      toolResult = await registry.executeTool(toolName, toolParams, intent)
      console.log(`[timing] tool.${toolName}: ${Date.now() - tTool}ms`)
    }

    return { reply, intent: toolName, toolResult }
  }

  async execute(command) {
    const normalized = command.toLowerCase().trim()

    const cached = cacheGet(normalized)
    if (cached) {
      console.log(`[timing] cache HIT for "${normalized.slice(0,40)}"`)
      return cached
    }

    const tMem = Date.now()
    const context = await memory.query(command, 5)
    console.log(`[timing] memory.query: ${Date.now() - tMem}ms`)

    void memory.save(command, { role: 'user', source: 'voice' }).catch(console.error)

    const state = await this.supervisorNode({ command, context })

    const result = { reply: state.reply || 'Got it.', intent: state.intent, toolResult: state.toolResult }
    if (state.reply) {
      void memory.save(state.reply, { role: 'assistant', intent: state.intent, source: 'voice' }).catch(console.error)
    }

    if (state.reply && state.reply.length > 10) {
      cacheSet(normalized, result)
    }

    return result
  }
}

module.exports = { SupervisorGraph }
