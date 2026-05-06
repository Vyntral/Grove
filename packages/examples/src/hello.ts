/**
 * hello.ts — single agent, single tool, single run.
 *
 *   bun packages/examples/src/hello.ts
 *
 * Demonstrates: agent definition, tool with Zod schema, supervised start.
 */
import { agent, supervise, tool } from '@vyntral/grove-core'
import { start } from '@vyntral/grove-runtime'
import { z } from 'zod'

const greet = tool({
  name: 'greet',
  description: 'Return a greeting for a name.',
  schema: z.object({ name: z.string() }),
  deterministic: true,
  run: ({ name }) => `hello, ${name} 🌳`,
})

const concierge = agent({
  name: 'concierge',
  model: 'anthropic/claude-haiku-4-5',
  system: 'You greet visitors politely.',
  tools: [greet],
})

export const tree = supervise({
  name: 'root',
  children: [concierge],
})

if (import.meta.main) {
  const { handle } = await start(tree)
  const out = await handle.run({ name: 'world' })
  console.log('result:', out)
  await handle.stop()
}
