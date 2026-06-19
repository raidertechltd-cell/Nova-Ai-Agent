const db = require('../db')

function getBalances() {
  return db.prepare('SELECT currency, balance FROM wallet').all()
}

function getTransactions(limit = 50) {
  return db.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT ?').all(limit)
}

function getVirtualAccount() {
  const account = db.prepare("SELECT * FROM wallet WHERE currency='VIRTUAL'").get()
  return account || { bank: 'Wema Bank', number: '0123456789', name: 'Nova AI User' }
}

function persistTransaction(type, amount, currency, meta) {
  try {
    const stmt = db.prepare('INSERT INTO transactions (ts,type,amount,currency,meta) VALUES (datetime("now"),?,?,?,?)')
    const info = stmt.run(type, amount, currency, JSON.stringify(meta || {}))

    const existing = db.prepare('SELECT * FROM wallet WHERE currency = ?').get(currency)
    if (existing) {
      db.prepare('UPDATE wallet SET balance = ? WHERE currency = ?').run(existing.balance + amount, currency)
    } else {
      db.prepare('INSERT INTO wallet (currency,balance) VALUES (?,?)').run(currency, amount)
    }

    return info.lastInsertRowid
  } catch (e) {
    console.error('DB persist error', e)
    return null
  }
}

module.exports = { getBalances, getTransactions, getVirtualAccount, persistTransaction }
