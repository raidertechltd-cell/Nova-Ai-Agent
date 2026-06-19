const db = require('../db')

function getAll(limit = 200) {
  return db.prepare('SELECT * FROM analytics ORDER BY id DESC LIMIT ?').all(limit)
}

function record(key, value) {
  const stmt = db.prepare('INSERT INTO analytics (ts,key,value) VALUES (datetime("now"),?,?)')
  return stmt.run(key, String(value))
}

module.exports = { getAll, record }
