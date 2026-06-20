const Anthropic = require('@anthropic-ai/sdk')

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'

let anthropic = null
if (CLAUDE_API_KEY) {
  anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY })
}

async function claudeConverse(messages, systemPrompt, tools) {
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const claudeTools = (tools || []).map((t) => ({
    name: t.toolSpec.name,
    description: t.toolSpec.description,
    input_schema: t.toolSpec.inputSchema.json,
  }))

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    system: systemPrompt,
    max_tokens: 1024,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    tools: claudeTools.length > 0 ? claudeTools : undefined,
  })

  const toolUse = response.content.find((c) => c.type === 'tool_use')
  const textBlock = response.content.find((c) => c.type === 'text')

  return {
    text: textBlock?.text || '',
    toolUse: toolUse
      ? {
          name: toolUse.name,
          input: toolUse.input,
        }
      : null,
  }
}

module.exports = { claudeConverse }
