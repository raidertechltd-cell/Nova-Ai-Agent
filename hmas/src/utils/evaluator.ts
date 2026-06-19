// Simple evaluator: checks task result quality; replace with LLM-based checks later
import https from 'https'

export function evaluateResult(result: any): { ok: boolean; score?: number; message?: string } {
  // synchronous fallback evaluator used when no LLM is available
  if (!process.env.OPENAI_API_KEY) {
    if (!result) return { ok: false, score: 0 }
    if (typeof result === 'object' && result.ok) return { ok: true, score: 1 }
    return { ok: false, score: 0 }
  }

  // When OPENAI_API_KEY is present, perform a lightweight remote check asynchronously
  // but keep this function synchronous for now — prefer Supervisor to call asyncEval instead.
  if (!result) return { ok: false, score: 0 }
  if (typeof result === 'object' && result.ok) return { ok: true, score: 1 }
  return { ok: false, score: 0 }
}

export async function asyncEvaluateWithLLM(taskDescription: string, result: any) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return evaluateResult(result)

  const prompt = `You are an evaluator. Given the task description and the agent's result, score the result between 0 and 1 and state if it meets the task. Return JSON: {\"ok\": boolean, \"score\": number, \"message\": string}. Task: ${taskDescription} Result: ${JSON.stringify(result)}`
  const payload = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are an objective evaluator.' }, { role: 'user', content: prompt }], max_tokens: 200 })

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

  return new Promise<{ ok: boolean; score?: number; message?: string }>((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString()
          const data = JSON.parse(body)
          const text = data.choices?.[0]?.message?.content || ''
          const jsonStart = text.indexOf('{')
          const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text
          const parsed = JSON.parse(jsonText)
          resolve(parsed)
        } catch (e) {
          resolve(evaluateResult(result))
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
