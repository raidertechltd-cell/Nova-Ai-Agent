import { Task } from '../types'

export class AnalystAgent {
  name = 'AnalystAgent'

  async perform(task: Task) {
    // TODO: implement scraping, processing, visualization generation
    return { ok: true, dataPreview: 'chart-url-or-binary' }
  }
}
