// Simple evaluator: checks task result quality; replace with LLM-based checks later
export function evaluateResult(result: any): { ok: boolean; score?: number; message?: string } {
  if (!result) return { ok: false, score: 0 }
  if (typeof result === 'object' && result.ok) return { ok: true, score: 1 }
  return { ok: false, score: 0 }
}
