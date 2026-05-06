import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { c, symbols } from '../colors.ts'

const TEMPLATE = `/**
 * Grove agent — supervised, recorded, hot-reloadable.
 *
 *   bun run agent.ts             # one shot
 *   grove run --watch agent.ts   # dev loop with hot reload
 *   grove bench                  # open the live inspector
 */
import { agent, supervise, tool } from '@vyntral/grove-core'
import { start } from '@vyntral/grove-runtime'
import { z } from 'zod'

const greet = tool({
  name: 'greet',
  description: 'Return a greeting for a name.',
  schema: z.object({ name: z.string() }),
  deterministic: true, // ← cached: identical input never re-executes
  run: ({ name }) => \`hello, \${name} 🌳\`,
})

const concierge = agent({
  name: 'concierge',
  model: 'anthropic/claude-haiku-4-5',
  system: 'You greet visitors politely. Always call the greet tool.',
  tools: [greet],
  // cache: true is the default for anthropic/* models — when system is
  //        large enough, Grove auto-caches it via Anthropic prompt caching.
})

export const tree = supervise({
  strategy: 'one_for_one',
  children: [concierge],
  restart: { intensity: 5, period: 60_000 },
})

if (import.meta.main) {
  const { handle, sessionId } = await start(tree)
  const out = await handle.run({ name: 'world' })
  console.log(out)
  console.log(\`session: \${sessionId} — inspect with: grove inspect \${sessionId}\`)
  await handle.stop()
}
`

export async function cmdInit(args: string[]): Promise<void> {
  const target = args[0] ?? 'agent.ts'
  const path = join(process.cwd(), target)

  if (existsSync(path)) {
    console.error(c.red(`${symbols.cross} ${target} already exists`))
    process.exit(1)
  }

  mkdirSync(join(process.cwd()), { recursive: true })
  writeFileSync(path, TEMPLATE)

  console.log(c.green(`${symbols.check} created ${c.bold(target)}`))
  console.log(c.dim(`  run it with: ${c.cyan(`grove run ${target}`)}`))
}
