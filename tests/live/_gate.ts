/**
 * Shared gate for live LLM integration tests.
 *
 * Each test file calls `liveOnly(suite, fn)`. The body only runs when both:
 *   - ANTHROPIC_API_KEY is set, AND
 *   - GROVE_DIRECT_PROVIDER=1
 *
 * Otherwise the suite is skipped — `bun test` stays green for contributors
 * who don't want to burn API credits, and CI enables them via a secret.
 */
import { describe } from 'bun:test'

export const isLive =
  !!process.env.ANTHROPIC_API_KEY &&
  process.env.GROVE_DIRECT_PROVIDER === '1'

export function liveOnly(name: string, body: () => void): void {
  ;(describe.skipIf(!isLive) as (n: string, fn: () => void) => void)(
    `live: ${name}`,
    body,
  )
}
