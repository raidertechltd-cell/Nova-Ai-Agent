import { CentralState } from '../state'
import { MemoryProvider } from '../memory/memoryProvider'
import { Task, UUID } from '../types'
import { uuid } from '../utils/uuid'
import { evaluateResult } from '../utils/evaluator'

type AgentPerformer = { perform: (task: Task) => Promise<any>; name?: string }

export class Supervisor {
  private agents: Record<string, AgentPerformer>

  constructor(private state: CentralState, private memory: MemoryProvider, agents: Record<string, AgentPerformer>) {
    this.agents = agents
  }

  async handleCommand(command: string) {
    // 1) Query memory for related context
    const context = await this.memory.query(command, 5)

    // 2) Decompose into subtasks
    const subtasks: Task[] = this.decompose(command, context)

    // 3) Create, assign, execute, evaluate, and persist
    for (const t of subtasks) {
      this.state.createTask(t)
      const agentName = t.assignedTo || 'unassigned'
      this.state.assignTask(t.id, agentName)

      const performer = this.agents[agentName]
      if (!performer) {
        this.state.updateTask(t.id, { status: 'failed' })
        continue
      }

      // Execute with retry loop
      const maxRetries = 2
      let attempt = 0
      let finalResult: any = null
      while (attempt <= maxRetries) {
        attempt += 1
        try {
          const result = await performer.perform(t)
          finalResult = result
          // Persist result to memory with metadata
          await this.memory.save({ id: uuid('mem-'), text: JSON.stringify(result), metadata: { taskId: t.id, agent: agentName, attempt }, createdAt: new Date().toISOString() })

          const evalRes = evaluateResult(result)
          if (evalRes.ok) {
            this.state.completeTask(t.id, result)
            break
          } else {
            // mark and retry
            this.state.updateTask(t.id, { attempts: attempt })
            if (attempt > maxRetries) {
              this.state.updateTask(t.id, { status: 'failed', result })
            }
          }
        } catch (err) {
          // save failure
          await this.memory.save({ id: uuid('mem-err-'), text: String(err), metadata: { taskId: t.id, agent: agentName, attempt, error: true }, createdAt: new Date().toISOString() })
          this.state.updateTask(t.id, { attempts: attempt })
          if (attempt > maxRetries) {
            this.state.updateTask(t.id, { status: 'failed', result: { error: String(err) } })
          }
        }
      }
    }
  }

  decompose(command: string, context: any): Task[] {
    // Rule-based decomposition: extend or replace with LLM-based planner
    const id1 = uuid('task-')
    const id2 = uuid('task-')
    return [
      { id: id1, description: `Analyze: ${command}`, assignedTo: 'AnalystAgent', status: 'pending', attempts: 0 },
      { id: id2, description: `Finance check: ${command}`, assignedTo: 'FinanceAgent', status: 'pending', attempts: 0 },
    ]
  }
}
