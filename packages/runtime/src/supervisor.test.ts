import { describe, expect, test } from 'bun:test'
import { agent, supervise, tool } from '@vyntral/grove-core'
import { z } from 'zod'
import { start } from './supervisor.ts'
import { MockBackend } from './executor.ts'
import { getRecorder } from './recorder.ts'

/**
 * Crash budget tests — verify the supervisor respects restart strategies
 * and intensity limits exactly the way OTP does.
 */

function flakyTool(failuresBeforeSuccess: number) {
  let calls = 0
  return tool({
    name: 'flaky',
    description: 'fails N times, then succeeds',
    schema: z.object({ x: z.string() }),
    run: ({ x }) => {
      calls += 1
      if (calls <= failuresBeforeSuccess) throw new Error(`fail ${calls}`)
      return `ok: ${x}`
    },
  })
}

describe('supervisor', () => {
  test('one_for_one restarts only the failed child after a crash', async () => {
    const failing = agent({
      name: 'failing',
      model: 'anthropic/claude-haiku-4-5',
      tools: [flakyTool(1)],
    })
    const tree = supervise({
      name: 'root',
      strategy: 'one_for_one',
      children: [failing],
      restart: { intensity: 5, period: 60_000 },
    })

    const { handle, sessionId } = await start(tree, { backend: new MockBackend() })

    await expect(handle.run({ x: 'first' })).rejects.toThrow(/fail 1/)
    const result = await handle.run<string>({ x: 'second' })
    expect(result).toBe('ok: second')
    await handle.stop()

    const session = getRecorder().getSession(sessionId)
    expect(session).not.toBeNull()
    const types = session!.events.map((e) => e.type)
    expect(types).toContain('crash')
    expect(types).toContain('restart')
  })

  test('exceeding intensity transitions supervisor to crashed', async () => {
    const failing = agent({
      name: 'always-fails',
      model: 'anthropic/claude-haiku-4-5',
      tools: [flakyTool(1000)], // never succeeds
    })
    const tree = supervise({
      name: 'tight',
      strategy: 'one_for_one',
      children: [failing],
      restart: { intensity: 2, period: 60_000 },
    })

    const { handle } = await start(tree, { backend: new MockBackend() })

    // First two crashes are within budget; third should escalate.
    for (let i = 0; i < 3; i++) {
      await expect(handle.run({ x: 'try' })).rejects.toThrow()
    }
    expect(handle.status()).toBe('crashed')
    await handle.stop()
  })

  test('rest_for_one restarts only the failed child + later siblings', async () => {
    const a = agent({
      name: 'a',
      model: 'anthropic/claude-haiku-4-5',
      tools: [flakyTool(0)],
    })
    const b = agent({
      name: 'b',
      model: 'anthropic/claude-haiku-4-5',
      tools: [flakyTool(1)],
    })
    const c = agent({
      name: 'c',
      model: 'anthropic/claude-haiku-4-5',
      tools: [flakyTool(0)],
    })
    const tree = supervise({
      name: 'rfo',
      strategy: 'rest_for_one',
      children: [a, b, c],
      restart: { intensity: 5, period: 60_000 },
    })

    const { handle, sessionId } = await start(tree, { backend: new MockBackend() })

    // Run b first (will crash)
    await expect((handle as any).run({ x: 'go' }, { agent: 'b' })).rejects.toThrow(/fail 1/)

    // Recorder should show restart events for b and c, NOT for a.
    const session = getRecorder().getSession(sessionId)!
    const restartedNames = session.events
      .filter((e) => e.type === 'restart')
      .map((e) => e.process)
    expect(restartedNames).toContain('b')
    expect(restartedNames).toContain('c')
    expect(restartedNames).not.toContain('a')

    await handle.stop()
  })
})
