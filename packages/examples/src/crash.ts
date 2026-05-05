/**
 * crash.ts — fault tolerance demo.
 *
 *   bun packages/examples/src/crash.ts
 *
 * The `flaky` tool throws on the first call. Without supervision the agent
 * would die. With Grove's supervisor, the failed run propagates, the
 * supervisor restarts the child under its strategy, and the next call
 * succeeds. The recorder captures the crash + restart events so the Bench
 * (or `grove inspect`) shows exactly what happened.
 */
import { agent, supervise, tool } from '@grove/core'
import { start } from '@grove/runtime'
import { MockBackend } from '@grove/runtime'
import { z } from 'zod'

let calls = 0
const flaky = tool({
  name: 'flaky',
  description: 'Crashes on the first call, succeeds afterwards.',
  schema: z.object({ ping: z.string() }),
  run: ({ ping }) => {
    calls += 1
    if (calls === 1) throw new Error('simulated transient failure')
    return `pong: ${ping}`
  },
})

const worker = agent({
  name: 'worker',
  model: 'anthropic/claude-haiku-4-5',
  system: 'You ping the flaky tool.',
  tools: [flaky],
})

export const tree = supervise({
  name: 'root',
  strategy: 'one_for_one',
  children: [worker],
  restart: { intensity: 5, period: 60_000 },
})

if (import.meta.main) {
  const { handle } = await start(tree, { backend: new MockBackend() })

  console.log('attempt 1 (will crash) ...')
  try {
    await handle.run({ ping: 'first' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log('  caught:', msg)
  }

  console.log('attempt 2 (after restart) ...')
  const result = await handle.run({ ping: 'second' })
  console.log('  result:', result)

  await handle.stop()
}
