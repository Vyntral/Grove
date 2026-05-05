/**
 * kitchen-sink.ts — every Grove feature in one file.
 *
 *   ANTHROPIC_API_KEY=... GROVE_DIRECT_PROVIDER=1 \
 *     bun packages/examples/src/kitchen-sink.ts
 *
 * Demonstrates, in a single agent topology:
 *   1. Real LLM call (anthropic/claude-haiku-4-5 via @ai-sdk/anthropic)
 *   2. Local typed deterministic tool (cached cross-process)
 *   3. MCP server tool (mounted from a stdio child process)
 *   4. Anthropic prompt caching (system prompt large enough to trigger)
 *   5. Supervised process with restart strategy + intensity guard
 *   6. Recorder capture (every event landed in .grove/recordings.db)
 *
 * Run twice and watch the cache + prompt-cache numbers climb.
 *
 * Visual companion:  grove bench  (inspector at http://localhost:4773)
 * Inspect the run:   grove inspect <session-id>
 */
import { join } from 'node:path'
import { agent, supervise, tool } from '@grove/core'
import { start, AISDKBackend, getCache } from '@grove/runtime'
import { mcpServer } from '@grove/mcp'
import { z } from 'zod'

/* ─── 1. local tool (deterministic, cacheable) ─────────────────────── */

const wordCount = tool({
  name: 'word_count',
  description: 'Count the words in a string. Use whenever the user asks how many words.',
  schema: z.object({ text: z.string() }),
  deterministic: true,
  run: ({ text }) => ({ count: text.trim().split(/\s+/).filter(Boolean).length }),
})

/* ─── 2. MCP server (real stdio child, real protocol) ──────────────── */

const fixture = await mcpServer({
  command: process.execPath, // bun
  args: [join(import.meta.dir, 'mcp-server-fixture.ts')],
  name: 'fixture',
  prefix: 'fix_',
})

/* ─── 3. agent with a long system prompt (triggers prompt caching) ── */

const SYSTEM = `You are Grove's kitchen-sink demo agent. You have access to two
families of tools:

(a) The local \`word_count\` tool, useful when the user asks how many words
    are in a piece of text. It is deterministic — Grove's cache short-circuits
    repeated identical calls.

(b) The MCP-mounted \`fix_*\` tool family, served by a stdio child process.
    \`fix_now\` returns the current ISO datetime. \`fix_echo\` returns its
    input verbatim. Treat these as you would any external service: they
    may have side effects, so Grove does not cache them.

When you answer:
  - lead with the answer, not the journey to it
  - prefer one-sentence responses over paragraphs
  - never apologise; never thank the user; never invite further questions

Style is neutral, technical, peer-to-peer. The user is a senior engineer
who already knows the basics. Cite tool calls inline when they materially
support your answer ("9 words, per word_count").

Reference repository the user is exploring:

# Grove repository — high-level map
- packages/core      types, agent/tool/memory/supervise factories
- packages/runtime   actor processes, supervisors, recorder, cache, watcher
- packages/compiler  topology analysis, cost projection, manifest emit
- packages/cli       grove init/run/inspect/compile/bench/eval/diff/cache
- packages/bench     live HTML inspector (HTTP + SSE + scrubber + fork)
- packages/eval      declarative eval cases + behaviour diff between profiles
- packages/mcp       MCP stdio adapter (tools as Grove tools)
- packages/examples  hello/crash/cached/persist/research/eval-suite/mcp-demo/kitchen-sink

# Notable invariants
- Every event in every supervised run lands in \`.grove/recordings.db\`.
- Deterministic tool outputs are keyed by canonical-JSON(input) under \`.grove/cache.db\`.
- Anthropic prompt caching is auto-on for \`anthropic/*\` models when the
  system prompt is large enough; opt out with \`agent({ cache: false })\`.
- Restart strategies are \`one_for_one\`, \`one_for_all\`, \`rest_for_one\`
  (OTP semantics, restart intensity guard included).

# Things you should not do
- Do not invent API names that don't appear above. If unsure, say so.
- Do not return JSON unless explicitly asked.
- Do not pad answers with hedging adverbs ("potentially", "generally").

# Things you should do
- When asked about Grove's architecture, ground the answer in the file map.
- When asked about timing, call \`fix_now\`.
- When asked about word counts, call \`word_count\`.
- When asked something outside Grove's domain, answer once, briefly, and
  flag that you're outside your strongest area.
` +
  // Pad to safely cross Anthropic's prompt-cache threshold (~4000 tokens for haiku-4-5).
  '\n\n# Reference notes (kept in cache to avoid re-billing)\n' +
  Array.from({ length: 80 })
    .map(
      (_, i) =>
        `- Invariant ${i + 1}: behaviour is recorded; supervisors restart on failure; tool outputs are content-hashed when deterministic; system prompts are cached when over the threshold.`,
    )
    .join('\n')

const concierge = agent({
  name: 'concierge',
  model: 'anthropic/claude-haiku-4-5',
  system: SYSTEM,
  tools: [wordCount, ...fixture.tools],
  temperature: 0,
  maxSteps: 6,
})

export const tree = supervise({
  name: 'kitchen-sink',
  strategy: 'one_for_one',
  children: [concierge],
  restart: { intensity: 5, period: 60_000 },
})

/* ─── runner ───────────────────────────────────────────────────────── */

if (import.meta.main) {
  if (
    !process.env.AI_GATEWAY_API_KEY &&
    !(process.env.GROVE_DIRECT_PROVIDER === '1' && process.env.ANTHROPIC_API_KEY)
  ) {
    console.log('🔑 missing key — set ANTHROPIC_API_KEY + GROVE_DIRECT_PROVIDER=1')
    await fixture.close()
    process.exit(0)
  }

  const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })

  console.log('\n▶ ask 1: word count of a sentence')
  const t1 = performance.now()
  const a1 = await handle.run<string>(
    'How many words is "production-grade agents with let-it-crash supervision"?',
  )
  console.log(`  ${a1}`)
  console.log(`  ${(performance.now() - t1).toFixed(0)}ms`)

  console.log('\n▶ ask 2: current ISO time (via MCP)')
  const t2 = performance.now()
  const a2 = await handle.run<string>('What is the current ISO date-time?')
  console.log(`  ${a2}`)
  console.log(`  ${(performance.now() - t2).toFixed(0)}ms`)

  console.log('\n▶ ask 3: word count again (same text → cache hit)')
  const t3 = performance.now()
  const a3 = await handle.run<string>(
    'How many words is "production-grade agents with let-it-crash supervision"?',
  )
  console.log(`  ${a3}`)
  console.log(`  ${(performance.now() - t3).toFixed(0)}ms`)

  const stats = getCache().stats()
  console.log()
  console.log(`tool cache: ${stats.hits} hits / ${stats.misses} misses (${(stats.hitRate * 100).toFixed(0)}%)`)
  console.log(`session: ${sessionId}`)
  console.log(`inspect: bun packages/cli/bin/grove.ts inspect ${sessionId}`)

  await handle.stop()
  await fixture.close()
}
