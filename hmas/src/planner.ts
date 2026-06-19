import { Task } from './types'
import { uuid } from './utils/uuid'
import https from 'https'

export async function decomposeWithLLM(command: string, context: any): Promise<Task[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // fallback to simple decomposition
    const id1 = uuid('task-')
    const id2 = uuid('task-')
    return [
      { id: id1, description: `Analyze: ${command}`, assignedTo: 'AnalystAgent', status: 'pending', attempts: 0 },
      { id: id2, description: `Finance check: ${command}`, assignedTo: 'FinanceAgent', status: 'pending', attempts: 0 },
    ]
  }

  const prompt = `You are a task planner. Break the user's command into up to 6 subtasks. For each subtask, return a JSON array of objects with fields: description, assignedTo (one of AnalystAgent, FinanceAgent, StudioAgent), and optional metadata. Command:\n${command}`

  const payload = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a helpful planner.' }, { role: 'user', content: prompt }], max_tokens: 800 })

  const opts = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: `Bearer ${apiKey}`,
    },
  }

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString()
          const data = JSON.parse(body)
          const text = data.choices?.[0]?.message?.content || ''
          // Attempt to extract JSON from the model output
          const jsonStart = text.indexOf('[')
          const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text
          const parsed = JSON.parse(jsonText)
          const tasks: Task[] = parsed.map((p: any) => ({ id: uuid('task-'), description: p.description, assignedTo: p.assignedTo, status: 'pending', attempts: 0 }))
          resolve(tasks)
        } catch (e) {
          // fallback simple split
          const id1 = uuid('task-')
          const id2 = uuid('task-')
          resolve([
            { id: id1, description: `Analyze: ${command}`, assignedTo: 'AnalystAgent', status: 'pending', attempts: 0 },
            { id: id2, description: `Finance check: ${command}`, assignedTo: 'FinanceAgent', status: 'pending', attempts: 0 },
          ])
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
