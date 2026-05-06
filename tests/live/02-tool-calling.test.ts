import { expect, test } from 'bun:test'
import { agent, supervise, tool } from '@vyntral/grove-core'
import { start, AISDKBackend, getRecorder } from '@vyntral/grove-runtime'
import { z } from 'zod'
import { liveOnly } from './_gate.ts'

liveOnly('agent calls a typed tool against real Claude', () => {
  test('the model invokes word_count and the recorder captures it', async () => {
    const wordCount = tool({
      name: 'word_count',
      description:
        'Count the words in a piece of text. Use this whenever the user asks how many words.',
      schema: z.object({ text: z.string() }),
      deterministic: true,
      run: ({ text }) => ({ count: text.trim().split(/\s+/).filter(Boolean).length }),
    })

    const counter = agent({
      name: 'counter',
      model: 'anthropic/claude-haiku-4-5',
      system:
        'You are a precise word counter. ALWAYS call word_count to compute, never guess.',
      tools: [wordCount],
      temperature: 0,
      maxSteps: 4,
    })

    const tree = supervise({ name: 'tool-calling', children: [counter] })
    const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

    const out = await handle.run<string>(
      'How many words is "the quick brown fox jumps over the lazy dog"?',
    )
    expect(out).toContain('9')

    const session = getRecorder().getSession(sessionId)!
    const types = session.events.map((e) => e.type)
    expect(types).toContain('tool_call')
    expect(types).toContain('tool_result')

    await handle.stop()
  }, 30_000)
})
