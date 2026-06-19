export type UUID = string

export interface MemoryRecord {
  id: UUID
  text: string
  embedding?: number[]
  metadata?: Record<string, any>
  createdAt: string
}

export interface Task {
  id: UUID
  description: string
  assignedTo?: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  attempts?: number
  result?: any
}

export interface State {
  tasks: Record<UUID, Task>
  agents: Record<string, { busy: boolean }>
}
