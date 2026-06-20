const fileTools = require('./file_system_tools')
const researchTools = require('./research_tools')
const wallet = require('./wallet')
const analytics = require('./analytics')
const paystack = require('./paystack')
const obsidian = require('./obsidian')
const memory = require('../memory')
const { logToolCall, checkDestructive } = require('../security_gate')

const CORE_TOOL_DEFS = {
  show_wallet: {
    description: 'Show the user their wallet/financial information including balances and transactions',
    params: {},
    destructive: false,
    handler: async () => {
      const [balances, transactions, ps] = await Promise.all([
        wallet.getBalances(),
        wallet.getTransactions(10),
        paystack.getBalance().catch(() => ({ data: [] })),
      ])
      return { status: 'success', data: { balances, transactions, paystack: ps.data || [] } }
    },
  },
  show_analytics: {
    description: 'Show analytics dashboard with stats, charts, and marketing data',
    params: {},
    destructive: false,
    handler: async () => {
      const rows = analytics.getAll(50)
      return { status: 'success', data: rows }
    },
  },
  show_backup: {
    description: 'Show backup files, documents, folders, and storage information',
    params: {},
    destructive: false,
    handler: async () => {
      const files = fileTools.searchFiles('')
      return { status: 'success', data: files.data }
    },
  },
  hide_overlay: {
    description: 'Close or hide the currently displayed overlay panel and return to the main idle view',
    params: {},
    destructive: false,
    handler: async () => ({ status: 'success', data: 'overlay closed' }),
  },
  create_folder: {
    description: 'Create a new folder/directory in the workspace',
    params: { path: { type: 'string', description: 'Path of the folder to create' } },
    destructive: false,
    handler: async ({ path }) => fileTools.createFolder(path),
  },
  search_files: {
    description: 'Search for files and folders in the workspace by name',
    params: { query: { type: 'string', description: 'Search query to match against file names' } },
    destructive: false,
    handler: async ({ query }) => fileTools.searchFiles(query),
  },
  list_directory: {
    description: 'List contents of a directory in the workspace',
    params: { path: { type: 'string', description: 'Directory path to list' } },
    destructive: false,
    handler: async ({ path }) => fileTools.listDirectory(path),
  },
  web_search: {
    description: 'Perform a web search for real-time information, news, or research',
    params: { query: { type: 'string', description: 'The search query' } },
    destructive: false,
    handler: async ({ query }) => researchTools.performWebSearch(query),
  },
  search_notes: {
    description: 'Search Obsidian notes by name or content',
    params: { query: { type: 'string', description: 'Search query to match against note names or content' } },
    destructive: false,
    handler: async ({ query }) => obsidian.searchNotes(query),
  },
  read_note: {
    description: 'Read the content of an Obsidian note by its file path',
    params: { path: { type: 'string', description: 'Relative path of the note within the vault (e.g. Projects/ideas.md)' } },
    destructive: false,
    handler: async ({ path }) => obsidian.readNote(path),
  },
  create_note: {
    description: 'Create a new Obsidian note with the given content',
    params: { path: { type: 'string', description: 'Relative path for the new note (e.g. Daily/2026-06-20.md)' }, content: { type: 'string', description: 'The markdown content to write' } },
    destructive: true,
    handler: async ({ path, content }) => obsidian.createNote(path, content),
  },
  list_notes: {
    description: 'List all notes in the Obsidian vault',
    params: {},
    destructive: false,
    handler: async () => obsidian.listNotes(),
  },
  dynamic_widget: {
    description: 'Render arbitrary data in the glass overlay as a dynamic floating widget (tables, stat-cards, charts, text). Spawns a frosted-glass HUD element.',
    params: { widgetType: { type: 'string', description: 'One of: table, stats, chart, text, custom' }, title: { type: 'string', description: 'Widget title' }, data: { type: 'object', description: 'Structured data to render. For stats: [{label, value}]. For table: {columns: [...], rows: [[...]]}. For chart: {labels: [...], values: [...]}. For text: {content: string}.' }, position: { type: 'string', description: 'Optional. Where to spawn the widget: center, top-left, top-right, bottom-left, bottom-right. Defaults to center with cascade offset.' } },
    destructive: false,
    handler: async ({ widgetType, title, data, position }) => {
      return { status: 'success', widget: { type: widgetType, title, data, position }, data: `Rendered ${widgetType} widget: ${title}` }
    },
  },
}

// ── Discovered tools are loaded from memory on startup ──
async function loadDiscoveredTools() {
  const stored = await memory.query('__discovered_tools__', 50)
  for (const row of stored) {
    if (!row.metadata) continue
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      if (meta._toolDef) {
        const name = meta._toolName
        if (name && !CORE_TOOL_DEFS[name]) {
          CORE_TOOL_DEFS[name] = meta._toolDef
        }
      }
    } catch {}
  }
}

// ── Fuzzy match: find closest tool by keyword overlap ──
function fuzzyFindTool(text) {
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)
  let bestScore = 0
  let bestName = null
  for (const [name, def] of Object.entries(CORE_TOOL_DEFS)) {
    const desc = def.description.toLowerCase()
    const nameWords = name.replace(/_/g, ' ').toLowerCase().split(/\s+/)
    let score = 0
    for (const w of words) {
      if (w.length < 3) continue
      if (desc.includes(w)) score += 2
      if (nameWords.some(nw => nw.includes(w) || w.includes(nw))) score += 3
    }
    if (score > bestScore) {
      bestScore = score
      bestName = name
    }
  }
  return bestScore >= 3 ? bestName : null
}

function getBedrockTools() {
  const tools = []
  for (const [name, def] of Object.entries(CORE_TOOL_DEFS)) {
    const props = {}
    const required = []
    for (const [k, v] of Object.entries(def.params)) {
      props[k] = v
      required.push(k)
    }
    tools.push({
      toolSpec: {
        name,
        description: def.description,
        inputSchema: {
          json: {
            type: 'object',
            properties: props,
            ...(required.length ? { required } : {}),
          },
        },
      },
    })
  }
  return tools
}

async function executeTool(toolName, params, intent) {
  const def = CORE_TOOL_DEFS[toolName]
  if (!def) return { status: 'error', message: `Unknown tool: ${toolName}` }

  const gate = checkDestructive(toolName)
  if (gate) return gate

  try {
    const result = await def.handler(params)
    logToolCall(intent || toolName, toolName, params, result)
    return result
  } catch (err) {
    const result = { status: 'error', message: err.message }
    logToolCall(intent || toolName, toolName, params, result)
    return result
  }
}

async function registerTool(name, description, params, destructive, handler) {
  const def = { description, params, destructive, handler }
  CORE_TOOL_DEFS[name] = def
  await memory.save(`discovered tool: ${name} - ${description}`, {
    role: 'system',
    _toolName: name,
    _toolDef: def,
    source: 'discovery',
  }).catch(() => {})
  return { status: 'success', tool: name }
}

// Load discovered tools from memory once DB is ready
try {
  const db = require('../db')
  if (db.ready) {
    db.ready.then(() => loadDiscoveredTools()).catch(() => {})
  }
} catch {} // DB may not be available in all contexts

module.exports = { CORE_TOOL_DEFS, getBedrockTools, executeTool, fuzzyFindTool, registerTool }
