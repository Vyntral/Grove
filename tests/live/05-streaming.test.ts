import { expect, test } from 'bun:test'
import { agent, supervise } from '@vyntral/grove-core'
import { start, AISDKBackend, getRecorder } from '@vyntral/grove-runtime'
import { liveOnly } from './_gate.ts'

liveOnly('streaming emits text_chunk events as tokens arrive', () => {
  test('multiple text_chunks land before the final result', async () => {
    const writer = agent({
      name: 'writer',
      model: 'anthropic/claude-haiku-4-5',
      system: 'Answer in 4-6 sentences. No preamble.',
      stream: true,
      temperature: 0,
      maxSteps: 1,
    })

    const tree = supervise({ name: 'stream-test', children: [writer] })
    const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

    const final = await handle.run<string>(
      'In 4-6 sentences: explain why supervision matters for AI agents.',
    )
    expect(typeof final).toBe('string')
    expect(final.length).toBeGreaterThan(50)

    const session = getRecorder().getSession(sessionId)!
    const chunks = session.events.filter((e) => e.type === 'text_chunk')
    expect(chunks.length).toBeGreaterThan(1)

    // The chunks should reassemble to (approximately) the final text.
    const reassembled = chunks
      .map((c) => (c.data as { text?: string }).text ?? '')
      .join('')
    expect(reassembled.length).toBeGreaterThan(50)

    await handle.stop()
  }, 60_000)
})
