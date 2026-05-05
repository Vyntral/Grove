/**
 * Best-effort price table (USD per million tokens) for cost projection.
 * Numbers are deliberately conservative — used only to give devs a *relative*
 * sense of the cost reduction the compiler will deliver.
 *
 * Update freely; this file is not load-bearing for correctness.
 */
export const PRICE_TABLE: Record<
  string,
  { in: number; out: number }
> = {
  'anthropic/claude-opus-4-7': { in: 15, out: 75 },
  'anthropic/claude-opus-4-6': { in: 15, out: 75 },
  'anthropic/claude-sonnet-4-6': { in: 3, out: 15 },
  'anthropic/claude-haiku-4-5': { in: 0.8, out: 4 },
  'openai/gpt-5.5': { in: 5, out: 30 },
  'openai/gpt-5/mini': { in: 0.5, out: 2.5 },
  'google/gemini-3.1-pro': { in: 3.5, out: 17 },
  'subq/subq-1m-preview': { in: 1, out: 4 },
}

const FALLBACK = { in: 5, out: 25 }

export function priceFor(modelId: string): { in: number; out: number } {
  return PRICE_TABLE[modelId] ?? FALLBACK
}

/** Cost in USD for a single hypothetical request given token budget. */
export function projectCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = priceFor(modelId)
  return (
    (promptTokens / 1_000_000) * p.in +
    (completionTokens / 1_000_000) * p.out
  )
}
