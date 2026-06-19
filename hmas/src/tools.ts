// Tools exposed to agents: Body and Loop (Level 2)
export const BodyTool = {
  name: 'Body',
  async call(payload: any) {
    // Placeholder: perform side effects (read/write files, call APIs)
    return { ok: true, result: null }
  },
}

export const LoopTool = {
  name: 'Loop',
  async call(taskId: string) {
    // Placeholder: let the system re-enqueue or split tasks
    return { ok: true }
  },
}
