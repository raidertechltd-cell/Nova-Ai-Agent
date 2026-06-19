const path = require('path')
const fs = require('fs')
const initSqlJs = require('sql.js')

const DB_FILE = process.env.DATABASE_FILE || path.resolve(__dirname,'..','data','nova.sqlite')
const dir = path.dirname(DB_FILE)
if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})

function toArgs(a) {
  if (a.length === 0) return undefined
  if (a.length === 1) return Array.isArray(a[0]) ? a[0] : [a[0]]
  return a
}

function wrap(raw) {
  const prepare = (sql) => {
    const stmt = raw.prepare(sql)
    const free = () => { try { stmt.free() } catch(e) {} }
    return {
      all(...params) {
        const args = toArgs(params)
        if (args) stmt.bind(args)
        const rows = []
        while (stmt.step()) rows.push(stmt.getAsObject())
        free()
        return rows
      },
      run(...params) {
        const args = toArgs(params)
        if (args) stmt.bind(args)
        stmt.step()
        free()
        const changes = raw.getRowsModified()
        const r = raw.exec("SELECT last_insert_rowid() id")
        const lastInsertRowid = r.length ? r[0].values[0][0] : 0
        if (changes > 0) save()
        return { lastInsertRowid, changes }
      },
      get(...params) {
        const args = toArgs(params)
        if (args) stmt.bind(args)
        let row
        if (stmt.step()) row = stmt.getAsObject()
        free()
        return row
      }
    }
  }

  function save() {
    const data = raw.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(DB_FILE, buffer)
  }

  return {
    exec(sql) { raw.exec(sql); save() },
    prepare
  }
}

let db
const ready = initSqlJs().then(SQL => {
  let raw
  if (fs.existsSync(DB_FILE)) {
    const data = fs.readFileSync(DB_FILE)
    raw = new SQL.Database(data)
  } else {
    raw = new SQL.Database()
  }
  db = wrap(raw)

  db.exec(`
CREATE TABLE IF NOT EXISTS wallet (
  id INTEGER PRIMARY KEY,
  currency TEXT,
  balance INTEGER
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  ts TEXT,
  type TEXT,
  amount INTEGER,
  currency TEXT,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY,
  ts TEXT,
  key TEXT,
  value TEXT
);
  `)
})

module.exports = new Proxy({}, {
  get(_, prop) {
    if (prop === 'ready') return ready
    return (...args) => {
      if (!db) throw new Error('Database not initialized yet. Await db.ready first.')
      return db[prop](...args)
    }
  }
})
