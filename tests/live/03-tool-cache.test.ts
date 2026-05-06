import { expect, test } from 'bun:test'
import { agent, supervise, tool } from '@vyntral/grove-core'
import { start, AISDKBackend, getRecorder, getCache } from '@vyntral/grove-runtime'
import { z } from 'zod'
import { liveOnly } from './_gate.ts'

liveOnly('deterministic-tool cache hits on second call', () => {
  test('same input → cache_hit event + tool runs only once', async () => {
    let executions = 0

    const lookup = tool({
      name: 'lookup',
      description: 'Look up the value associated with a key.',
      schema: z.object({ key: z.string() }),
      deterministic: true,
      run: ({ key }) => {
        executions += 1
        return { key, value: `record-${key}` }
      },
    })

    const a = agent({
      name: 'looker',
      model: 'anthropic/claude-haiku-4-5',
      system:
        'When the user gives you a key, call the lookup tool and tell them the resulting value.',
      tools: [lookup],
      temperature: 0,
      maxSteps: 3,
    })

    getCache().reset()
    const tree = supervise({ name: 'cache-test', children: [a] })
    const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

    await handle.run('What is the value for key "alpha"?')
    await handle.run('What is the value for key "alpha"?')

    expect(executions).toBe(1) // tool body ran once; second call hit cache

    const session = getRecorder().getSession(sessionId)!
    const types = session.events.map((e) => e.type)
    expect(types).toContain('cache_miss')
    expect(types).toContain('cache_hit')

    await handle.stop()
  }, 60_000)
})
