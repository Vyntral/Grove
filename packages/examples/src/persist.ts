/**
 * persist.ts — confirms the cache survives across processes.
 *
 *   bun packages/examples/src/persist.ts          # first run: cache miss
 *   bun packages/examples/src/persist.ts          # second run: cache hit
 *
 * Unlike `cached.ts`, this script does NOT call `getCache().reset()`. Run it
 * twice from your shell — the second invocation is essentially free.
 */
import { agent, supervise, tool } from '@grove/core'
import { start, getCache } from '@grove/runtime'
import { z } from 'zod'

const slow = tool({
  name: 'slow',
  description: 'Pretend this is a 500ms HTTP call.',
  schema: z.object({ key: z.string() }),
  deterministic: true,
  run: async ({ key }) => {
    await new Promise((r) => setTimeout(r, 500))
    return `value-${key}`
  },
})

const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [slow] })
export const tree = supervise({ name: 'r', children: [a] })

if (import.meta.main) {
  const { handle } = await start(tree)
  const t0 = performance.now()
  await handle.run({ key: 'foo' })
  console.log(`run: ${(performance.now() - t0).toFixed(0)}ms`)
  console.log('cache stats:', getCache().stats())
  await handle.stop()
}
