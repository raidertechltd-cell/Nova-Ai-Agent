import { State, Task, UUID } from './types'

export class CentralState {
  private state: State = { tasks: {}, agents: {} }

  registerAgent(name: string) {
    this.state.agents[name] = { busy: false }
  }

  createTask(task: Task) {
    this.state.tasks[task.id] = task
  }

  updateTask(id: UUID, patch: Partial<Task>) {
    const t = this.state.tasks[id]
    if (!t) throw new Error('task not found')
    this.state.tasks[id] = { ...t, ...patch }
  }

  assignTask(id: UUID, agentName: string) {
    this.updateTask(id, { assignedTo: agentName, status: 'in-progress' })
    this.state.agents[agentName].busy = true
  }

  completeTask(id: UUID, result: any) {
    this.updateTask(id, { status: 'completed', result })
    const agent = this.state.tasks[id].assignedTo
    if (agent) this.state.agents[agent].busy = false
  }

  getState(): State {
    return JSON.parse(JSON.stringify(this.state))
  }
}
