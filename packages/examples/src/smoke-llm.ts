/**
 * smoke-llm.ts — end-to-end smoke test against a real LLM.
 *
 *   AI_GATEWAY_API_KEY=...   bun packages/examples/src/smoke-llm.ts   # via AI Gateway (preferred)
 *   ANTHROPIC_API_KEY=... GROVE_DIRECT_PROVIDER=1 bun packages/examples/src/smoke-llm.ts   # direct
 *
 * Verifies the full Grove stack against a frontier model: supervisor +
 * recorder + cache + AI SDK v6. The agent is given a deterministic tool
 * the model is meant to actually call. Run twice — second invocation
 * hits the cache and avoids the tool round-trip.
 */
import { agent, supervise, tool } from '@grove/core'
import { start, AISDKBackend, getCache } from '@grove/runtime'
import { z } from 'zod'

const wordCount = tool({
  name: 'word_count',
  description: 'Count the words in a string. Use this whenever the user asks how many words.',
  schema: z.object({ text: z.string() }),
  deterministic: true,
  run: ({ text }) => ({ count: text.trim().split(/\s+/).filter(Boolean).length }),
})

const counter = agent({
  name: 'counter',
  model: 'anthropic/claude-haiku-4-5',
  system:
    'You are a precise word-counter. When the user gives you text, call the word_count tool and report the exact number.',
  tools: [wordCount],
  temperature: 0,
  maxSteps: 4,
})

export const tree = supervise({ name: 'smoke', children: [counter] })

if (import.meta.main) {
  const hasGateway =
    !!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL_OIDC_TOKEN
  const hasDirect =
    process.env.GROVE_DIRECT_PROVIDER === '1' && !!process.env.ANTHROPIC_API_KEY

  if (!hasGateway && !hasDirect) {
    console.log('🔑 no credentials found — set one of:')
    console.log('   • AI_GATEWAY_API_KEY  (Vercel AI Gateway, recommended)')
    console.log('   • VERCEL_OIDC_TOKEN   (auto-set on Vercel)')
    console.log('   • ANTHROPIC_API_KEY + GROVE_DIRECT_PROVIDER=1  (direct)')
    console.log('falling back to mock backend so you can see the shape.')
    process.exit(0)
  }

  const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

  const text = 'The quick brown fox jumps over the lazy dog.'

  console.log('▶ first run (cold cache)')
  const t0 = performance.now()
  const out1 = await handle.run<string>(`How many words is this? "${text}"`)
  console.log(`  answer: ${out1}`)
  console.log(`  latency: ${(performance.now() - t0).toFixed(0)}ms`)

  console.log('\n▶ second run (warm cache)')
  const t1 = performance.now()
  const out2 = await handle.run<string>(`How many words is this? "${text}"`)
  console.log(`  answer: ${out2}`)
  console.log(`  latency: ${(performance.now() - t1).toFixed(0)}ms`)

  const stats = getCache().stats()
  console.log(`\ncache: ${stats.hits} hits / ${stats.misses} misses (${(stats.hitRate * 100).toFixed(0)}%)`)
  console.log(`session: ${sessionId}  →  inspect with: grove inspect ${sessionId}`)

  await handle.stop()
}
