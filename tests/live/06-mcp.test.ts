import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { agent, supervise } from '@grove/core'
import { start, AISDKBackend, getRecorder } from '@grove/runtime'
import { mcpServer } from '@grove/mcp'
import { liveOnly } from './_gate.ts'

liveOnly('MCP server tools are callable by a real model', () => {
  test('agent invokes fix_now via stdio MCP and returns the ISO date', async () => {
    const fixturePath = join(
      process.cwd(),
      'packages/examples/src/mcp-server-fixture.ts',
    )

    const fixture = await mcpServer({
      command: process.execPath,
      args: [fixturePath],
      name: 'fixture',
      prefix: 'fix_',
    })

    expect(fixture.tools.map((t) => t.name)).toContain('fix_now')

    const a = agent({
      name: 'concierge',
      model: 'anthropic/claude-haiku-4-5',
      system:
        'When asked the time, ALWAYS call fix_now. Reply with just the result.',
      tools: fixture.tools,
      temperature: 0,
      maxSteps: 4,
    })

    const tree = supervise({ name: 'mcp-test', children: [a] })
    const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

    const out = await handle.run<string>(
      'What is the current ISO 8601 datetime? Use fix_now.',
    )
    // Loose match on ISO 8601 — we accept variations because the model
    // formats around the result. The session must show a real tool call.
    expect(out).toMatch(/20\d{2}-\d{2}-\d{2}/)

    const session = getRecorder().getSession(sessionId)!
    const calls = session.events.filter((e) => e.type === 'tool_call')
    expect(calls.length).toBeGreaterThan(0)
    expect(
      calls.some((c) => (c.data as { tool?: string }).tool === 'fix_now'),
    ).toBe(true)

    await handle.stop()
    await fixture.close()
  }, 60_000)
})
