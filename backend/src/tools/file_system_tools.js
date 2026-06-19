const path = require('path')
const fs = require('fs')

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..')
const SANDBOX_DIRS = [
  path.resolve(WORKSPACE_ROOT, 'data'),
  path.resolve(WORKSPACE_ROOT, 'exports'),
  path.resolve(WORKSPACE_ROOT, 'backups'),
]

for (const d of SANDBOX_DIRS) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

function isPathSafe(targetPath) {
  const resolved = path.resolve(targetPath)
  return SANDBOX_DIRS.some((safe) => resolved.startsWith(safe))
}

function createFolder(folderPath) {
  // Default relative paths to data/
  const resolved = path.isAbsolute(folderPath) ? folderPath : path.join('data', folderPath)
  const target = path.resolve(WORKSPACE_ROOT, resolved)
  if (!isPathSafe(target)) {
    return { status: 'error', message: `Access denied: path outside sandbox. Allowed: ${SANDBOX_DIRS.join(', ')}` }
  }
  try {
    fs.mkdirSync(target, { recursive: true })
    return { status: 'success', data: `Folder created at ${target}` }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}

function searchFiles(query) {
  const results = []
  for (const dir of SANDBOX_DIRS) {
    if (!fs.existsSync(dir)) continue
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          name: entry.name,
          path: path.join(dir, entry.name),
          type: entry.isDirectory() ? 'folder' : 'file',
          size: entry.isFile() ? fs.statSync(path.join(dir, entry.name)).size : null,
        })
      }
    }
  }
  return { status: 'success', data: results }
}

function listDirectory(dirPath) {
  const target = path.resolve(WORKSPACE_ROOT, dirPath || '')
  if (!isPathSafe(target)) {
    return { status: 'error', message: `Access denied: path outside sandbox. Allowed: ${SANDBOX_DIRS.join(', ')}` }
  }
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true })
    const data = entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'folder' : 'file',
      size: e.isFile() ? fs.statSync(path.join(target, e.name)).size : null,
    }))
    return { status: 'success', data }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}

module.exports = { createFolder, searchFiles, listDirectory, SANDBOX_DIRS }
