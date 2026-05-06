/**
 * mcp-demo.ts — Grove agent talking to a real MCP server.
 *
 *   bun packages/examples/src/mcp-demo.ts
 *
 * Spawns the local fixture as an MCP stdio server, mounts its tools onto
 * a Grove agent, and runs them through the supervisor + recorder.
 *
 * Real MCP traffic over real stdio. If Grove ever lies about being
 * MCP-native, this file will fail.
 */
import { join } from 'node:path'
import { agent, supervise } from '@vyntral/grove-core'
import { start } from '@vyntral/grove-runtime'
import { mcpServer } from '@vyntral/grove-mcp'

const fixturePath = join(import.meta.dir, 'mcp-server-fixture.ts')

const fixture = await mcpServer({
  command: process.execPath, // bun
  args: [fixturePath],
  name: 'fixture',
  prefix: 'fix_',
})

console.log('mounted MCP tools:', fixture.tools.map((t) => t.name))

const concierge = agent({
  name: 'concierge',
  model: 'anthropic/claude-haiku-4-5',
  system:
    'You are precise. When asked the time, call fix_now. When asked to echo, call fix_echo.',
  tools: fixture.tools,
  maxSteps: 4,
})

export const tree = supervise({ name: 'mcp-demo', children: [concierge] })

if (import.meta.main) {
  if (
    !process.env.AI_GATEWAY_API_KEY &&
    !(process.env.GROVE_DIRECT_PROVIDER === '1' && process.env.ANTHROPIC_API_KEY)
  ) {
    console.log('🔑 missing key — set ANTHROPIC_API_KEY + GROVE_DIRECT_PROVIDER=1')
    await fixture.close()
    process.exit(0)
  }

  const { handle, sessionId } = await start(tree)

  console.log('\n▶ asking the agent the current time...')
  const out = await handle.run<string>(
    'What is the current ISO date-time? Use the now tool.',
  )
  console.log(`  answer: ${out}`)

  console.log(`\nsession: ${sessionId}`)
  console.log(`inspect: bun packages/cli/bin/grove.ts inspect ${sessionId}`)

  await handle.stop()
  await fixture.close()
}
