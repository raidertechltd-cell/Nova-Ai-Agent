import { Task } from '../types'

export class FinanceAgent {
  name = 'FinanceAgent'

  async perform(task: Task) {
    // TODO: integrate with Paystack and ledger storage
    // Placeholder implementation
    return { ok: true, note: `Finance performed: ${task.description}` }
  }
}
