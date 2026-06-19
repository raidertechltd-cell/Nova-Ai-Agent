import { InMemoryProvider } from './memory/memoryProvider'
import { CentralState } from './state'
import { Supervisor } from './agents/supervisor'
import { FinanceAgent } from './agents/financeAgent'
import { AnalystAgent } from './agents/analystAgent'
import { StudioAgent } from './agents/studioAgent'
import { autonomousLoop } from './loop'

async function main() {
  const memory = new InMemoryProvider()
  const state = new CentralState()

  // register agents
  state.registerAgent('FinanceAgent')
  state.registerAgent('AnalystAgent')
  state.registerAgent('StudioAgent')

  const finance = new FinanceAgent()
  const analyst = new AnalystAgent()
  const studio = new StudioAgent()

  const agents = {
    FinanceAgent: finance,
    AnalystAgent: analyst,
    StudioAgent: studio,
  }

  const supervisor = new Supervisor(state, memory, agents)

  // Example: start autonomous loop for a given command
  await autonomousLoop(supervisor, 'Audit last month revenue and generate a report')

  // show final state and memory snapshot (for demo)
  console.log('State:', state.getState())
  const memSample = await memory.query('Audit', 10)
  console.log('Memory sample:', memSample)
}

main().catch((err) => {
  console.error('HMAS error', err)
  process.exit(1)
})
