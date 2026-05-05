/**
 * stream.ts — token-by-token streaming with Grove.
 *
 *   ANTHROPIC_API_KEY=... GROVE_DIRECT_PROVIDER=1 \
 *     bun packages/examples/src/stream.ts
 *
 * Demonstrates `agent({ stream: true })`. Streaming uses the same
 * supervisor + recorder + cache wiring as non-streaming — the runtime
 * just emits `text_chunk` events as the model produces them, so the
 * Bench shows tokens land in real time.
 */
import { agent, supervise } from '@grove/core'
import { start, AISDKBackend, getRecorder } from '@grove/runtime'

const writer = agent({
  name: 'writer',
  model: 'anthropic/claude-haiku-4-5',
  system:
    'You are a precise technical writer. Answer in 4-6 sentences, no preamble.',
  stream: true, // ← opt-in streaming
  temperature: 0.2,
  maxSteps: 1,
})

export const tree = supervise({ name: 'stream-demo', children: [writer] })

if (import.meta.main) {
  if (
    !process.env.AI_GATEWAY_API_KEY &&
    !(process.env.GROVE_DIRECT_PROVIDER === '1' && process.env.ANTHROPIC_API_KEY)
  ) {
    console.log('🔑 missing key — set ANTHROPIC_API_KEY + GROVE_DIRECT_PROVIDER=1')
    process.exit(0)
  }

  // Subscribe to text_chunk events from the recorder so we can echo
  // them to stdout as they arrive.
  const rec = getRecorder()
  rec.events.subscribe((ev) => {
    if (ev.type === 'text_chunk') {
      const data = ev.data as { text?: string }
      if (data.text) process.stdout.write(data.text)
    }
  })

  const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

  console.log('▶ streaming response (you should see tokens land live):')
  console.log('───────────────────────────────────────────────────────')
  const final = await handle.run<string>(
    'In 4-6 sentences: explain why Erlang/OTP-style supervision matters for AI agents.',
  )
  console.log()
  console.log('───────────────────────────────────────────────────────')
  console.log(`final length: ${final.length} chars`)
  console.log(`session: ${sessionId}`)

  await handle.stop()
}
