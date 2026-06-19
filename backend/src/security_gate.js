const fs = require('fs')
const path = require('path')

const LOG_FILE = path.resolve(__dirname, '..', '..', 'system_evolution.log')

function ensureLog() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, `=== Nova System Evolution Log ===\nStarted: ${new Date().toISOString()}\n\n`)
  }
}

function logToolCall(intent, toolName, params, result) {
  ensureLog()
  const entry = [
    `[${new Date().toISOString()}]`,
    `INTENT: ${intent}`,
    `TOOL: ${toolName}`,
    `PARAMS: ${JSON.stringify(params)}`,
    `RESULT: ${JSON.stringify(result)}`,
    '---',
  ].join('\n') + '\n'
  fs.appendFileSync(LOG_FILE, entry)
  console.log(`[gate] logged ${toolName} call`)
}

const DESTRUCTIVE_TOOLS = new Set(['delete_file', 'delete_folder', 'overwrite_file', 'move_file'])

// Currently destructive tools are not implemented — this is an extensibility point.
// When a destructive tool is added, gate it by returning requires_approval.
function checkDestructive(toolName) {
  return DESTRUCTIVE_TOOLS.has(toolName)
    ? { status: 'requires_approval', message: `Destructive action "${toolName}" requires confirmation. Say "yes, proceed" to confirm.` }
    : null
}

module.exports = { logToolCall, checkDestructive }
