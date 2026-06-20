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

const SYSTEM_PROMPT = `You are Nova, an AI workspace assistant with a voice-first interface. Address the user as Mr. David. Be efficient, logical, and witty. Maintain a machine-like persona. Respond conversationally, warmly, and briefly (1-2 short sentences). Never include tags like <thinking> or markdown in your response. You have access to tools that control the UI. When the user's request matches a tool, USE IT. If no tool is needed, respond naturally without calling any tool.

When Mr. David asks for a file operation or deep research, you must invoke the corresponding tool. For web research use web_search. For file operations use create_folder, search_files, or list_directory.

Available tools:
- show_wallet: finances, balance, paystack, payments, transactions, money
- show_analytics: stats, analytics, marketing, data, reports, charts, performance
- show_backup: files, backup, storage, folders, documents, exports
- hide_overlay: go back, close, hide, return to home, clear, dismiss
- create_folder: create a new folder or directory in the workspace
- search_files: find files and folders in the workspace by name
- list_directory: list contents of a directory in the workspace
- web_search: perform a web search for real-time information, news, or research
- search_notes: search Obsidian notes by name or content
- read_note: read the content of an Obsidian note
- create_note: create a new Obsidian note with markdown content
- list_notes: list all notes in the Obsidian vault

Always respond in a natural, empathetic tone. You are Nova — precise, efficient, and always in control.`

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
    let content, toolName, toolParams, reply

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

    const result = { reply: state.reply || 'Got it.', intent: state.intent }
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
