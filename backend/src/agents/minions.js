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
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function studioMinion({ command }) {
  return {
    ok: true,
    data: {
      status: 'ready',
      capabilities: ['file_ops', 'backup'],
    },
  }
}

module.exports = { financeMinion, analyticsMinion, studioMinion }
