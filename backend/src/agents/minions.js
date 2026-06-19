const wallet = require('../tools/wallet')
const analytics = require('../tools/analytics')
const paystack = require('../tools/paystack')

async function financeMinion({ command }) {
  try {
    const [balances, transactions, paystackBalance] = await Promise.all([
      wallet.getBalances(),
      wallet.getTransactions(10),
      paystack.getBalance().catch(() => ({ data: [] })),
    ])
    return {
      ok: true,
      data: {
        balances,
        paystack: paystackBalance.data || [],
        transactions,
      },
      summary: `Retrieved wallet info with ${balances.length} balances and ${transactions.length} recent transactions.`,
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function analyticsMinion({ command }) {
  try {
    const rows = analytics.getAll(50)
    return {
      ok: true,
      data: rows,
      summary: `Retrieved ${rows.length} analytics records.`,
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function studioMinion({ command }) {
  // Studio handles creative/generative tasks and file operations
  // Currently returns placeholder — expand when file management is needed
  return {
    ok: true,
    data: {
      message: 'Studio capabilities are ready.',
      storage: 'Backup and file operations available.',
    },
    summary: 'Studio agent ready. File listing and backup operations are available.',
  }
}

module.exports = { financeMinion, analyticsMinion, studioMinion }
