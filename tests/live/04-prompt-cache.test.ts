import { expect, test } from 'bun:test'
import { agent, supervise } from '@vyntral/grove-core'
import { start, AISDKBackend, getRecorder } from '@vyntral/grove-runtime'
import { liveOnly } from './_gate.ts'

// Anthropic prompt-cache minimum is published as 1024 tokens; in practice
// haiku-4-5 only writes to cache reliably for content well above ~4000
// tokens. Build a varied 9000+ token system prompt to safely clear the
// threshold every run.
const SYSTEM =
  `You are Atlas, a senior research assistant. You answer in one short sentence.\n\n` +
  ('Detailed technical assistant guidance for distributed systems, programming language design, type theory, the history of operating systems, formal verification, the economics of cloud infrastructure, and the design tradeoffs in modern machine-learning systems. '.repeat(50) + '\n').repeat(20)

liveOnly('Anthropic prompt caching writes once and reads back', () => {
  test('second call has cache_read_input_tokens > 0', async () => {
    const a = agent({
      name: 'long-system',
      model: 'anthropic/claude-haiku-4-5',
      system: SYSTEM,
      temperature: 0,
      maxSteps: 1,
    })
    const tree = supervise({ name: 'prompt-cache', children: [a] })
    const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

    await handle.run('Reply with "first".')
    await handle.run('Reply with "second".')

    const session = getRecorder().getSession(sessionId)!
    const promptCacheEvents = session.events.filter((e) => e.type === 'prompt_cache')
    expect(promptCacheEvents.length).toBeGreaterThanOrEqual(2)

    // At least one event should report a cache read (the second call).
    const totalRead = promptCacheEvents.reduce((sum, e) => {
      const data = e.data as { cacheRead?: number } | undefined
      return sum + (data?.cacheRead ?? 0)
    }, 0)
    expect(totalRead).toBeGreaterThan(0)

    await handle.stop()
  }, 60_000)
})
