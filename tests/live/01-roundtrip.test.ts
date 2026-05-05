import { expect, test } from 'bun:test'
import { agent, supervise } from '@grove/core'
import { start, AISDKBackend } from '@grove/runtime'
import { liveOnly } from './_gate.ts'

liveOnly('AISDK roundtrip vs claude-haiku-4-5', () => {
  test('responds with a non-empty answer', async () => {
    const a = agent({
      name: 'echo',
      model: 'anthropic/claude-haiku-4-5',
      system: 'You answer in one short sentence.',
      temperature: 0,
    })
    const tree = supervise({ name: 'roundtrip', children: [a] })
    const { handle } = await start(tree, { backend: new AISDKBackend() })

    const out = await handle.run<string>('Reply with the single word "ok".')
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
    expect(out.toLowerCase()).toContain('ok')

    await handle.stop()
  }, 30_000)
})
