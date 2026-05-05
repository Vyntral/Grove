/**
 * cached.ts — deterministic cache demo.
 *
 *   bun packages/examples/src/cached.ts
 *
 * Runs the same agent twice. The first run executes the (deliberately slow)
 * deterministic tool; the second run hits the cache and skips execution
 * entirely. The console prints the latency delta and the recorder logs
 * `cache_hit` events visible in the Bench (`grove bench`).
 */
import { agent, supervise, tool } from '@grove/core'
import { start, getCache } from '@grove/runtime'
import { z } from 'zod'

const expensiveLookup = tool({
  name: 'lookup',
  description: 'Pretend to query a slow external system.',
  schema: z.object({ key: z.string() }),
  deterministic: true, // ← unlocks caching
  run: async ({ key }) => {
    await new Promise((r) => setTimeout(r, 600)) // simulate slow API
    return { key, found: true, value: `record-${key}` }
  },
})

const lookupAgent = agent({
  name: 'lookup-agent',
  model: 'anthropic/claude-haiku-4-5',
  tools: [expensiveLookup],
})

export const tree = supervise({ name: 'cache-demo', children: [lookupAgent] })

if (import.meta.main) {
  // start fresh
  getCache().reset()

  const { handle } = await start(tree)

  console.log('first run (cold cache) ...')
  const t1 = performance.now()
  await handle.run({ key: 'order-42' })
  const dt1 = performance.now() - t1
  console.log(`  took ${dt1.toFixed(0)}ms`)

  console.log('second run (warm cache) ...')
  const t2 = performance.now()
  await handle.run({ key: 'order-42' })
  const dt2 = performance.now() - t2
  console.log(`  took ${dt2.toFixed(0)}ms`)

  const stats = getCache().stats()
  const speedup = dt1 / Math.max(dt2, 1)
  console.log()
  console.log(`speedup: ${speedup.toFixed(1)}× faster on cache hit`)
  console.log(`cache:   ${stats.hits} hits, ${stats.misses} misses, ${stats.entries} entries`)

  await handle.stop()
}
