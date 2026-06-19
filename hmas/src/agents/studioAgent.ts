import { Task } from '../types'

export class StudioAgent {
  name = 'StudioAgent'

  async perform(task: Task) {
    // TODO: implement code generation, repo management, CI triggers
    return { ok: true, filesCreated: [] }
  }
}
