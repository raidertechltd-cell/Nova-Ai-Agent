const fs = require('fs')
const path = require('path')

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || ''

function ensureVault() {
  if (!VAULT_PATH) throw new Error('OBSIDIAN_VAULT_PATH not set')
  if (!fs.existsSync(VAULT_PATH)) throw new Error(`Vault path does not exist: ${VAULT_PATH}`)
}

function walkDir(dir, baseDir = dir) {
  const results = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...walkDir(full, baseDir))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push({
          path: full,
          relativePath: path.relative(baseDir, full),
          name: entry.name.replace(/\.md$/, ''),
        })
      }
    }
  } catch {}
  return results
}

async function listNotes() {
  ensureVault()
  const files = walkDir(VAULT_PATH)
  return { status: 'success', data: files.map((f) => ({ name: f.name, path: f.relativePath })) }
}

async function searchNotes(query) {
  ensureVault()
  const files = walkDir(VAULT_PATH)
  const lower = query.toLowerCase()
  const matches = files.filter((f) => f.name.toLowerCase().includes(lower))
  // Also search content
  const contentMatches = []
  for (const f of files) {
    try {
      const content = fs.readFileSync(f.path, 'utf-8')
      if (content.toLowerCase().includes(lower)) {
        const lines = content.split('\n')
        const snippet = lines.slice(0, 5).join('\n').slice(0, 300)
        contentMatches.push({ name: f.name, path: f.relativePath, snippet })
      }
    } catch {}
  }
  const seen = new Set()
  const all = [...matches, ...contentMatches]
  const deduped = []
  for (const item of all) {
    if (!seen.has(item.path)) {
      seen.add(item.path)
      deduped.push(item)
    }
  }
  return { status: 'success', data: deduped.slice(0, 10) }
}

async function readNote(notePath) {
  ensureVault()
  const fullPath = path.resolve(VAULT_PATH, notePath)
  if (!fullPath.startsWith(path.resolve(VAULT_PATH))) {
    return { status: 'error', message: 'Path traversal denied' }
  }
  if (!fs.existsSync(fullPath)) {
    return { status: 'error', message: `Note not found: ${notePath}` }
  }
  const content = fs.readFileSync(fullPath, 'utf-8')
  return { status: 'success', data: { path: notePath, content } }
}

async function createNote(notePath, content) {
  ensureVault()
  const fullPath = path.resolve(VAULT_PATH, notePath)
  if (!fullPath.startsWith(path.resolve(VAULT_PATH))) {
    return { status: 'error', message: 'Path traversal denied' }
  }
  const dir = path.dirname(fullPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
  return { status: 'success', data: { path: notePath } }
}

module.exports = { listNotes, searchNotes, readNote, createNote }
