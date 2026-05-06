/**
 * eval-suite.ts — example eval suite + diff demo.
 *
 *   bun packages/cli/bin/grove.ts eval packages/examples/src/eval-suite.ts
 *   # change a tool's logic, run again, then:
 *   bun packages/cli/bin/grove.ts diff word-counter
 *
 * Demonstrates @vyntral/grove-eval: declare cases, run them, save a profile,
 * compare profiles to detect regressions.
 */
import { agent, supervise, tool } from '@vyntral/grove-core'
import { evalCase, suite, contains, matches } from '@vyntral/grove-eval'
import { z } from 'zod'

const wordCount = tool({
  name: 'word_count',
  description: 'Count words in a string.',
  schema: z.object({ text: z.string() }),
  deterministic: true,
  run: ({ text }) => ({ count: text.trim().split(/\s+/).filter(Boolean).length }),
})

const counter = agent({
  name: 'counter',
  model: 'anthropic/claude-haiku-4-5',
  system: 'You count words. Use the word_count tool then report the number.',
  tools: [wordCount],
  temperature: 0,
  maxSteps: 4,
})

export const tree = supervise({ name: 'eval-demo', children: [counter] })

export const evalSuite = suite('word-counter', [
  evalCase({
    id: 'short',
    input: 'How many words: "hello world"?',
    assertions: [contains('2'), matches(/\bwords?\b/i)],
  }),
  evalCase({
    id: 'medium',
    input: 'How many words: "the quick brown fox jumps over the lazy dog"?',
    assertions: [contains('9'), matches(/\bwords?\b/i)],
  }),
  evalCase({
    id: 'with-punctuation',
    input: 'How many words: "well, that\'s a five-word phrase!"?',
    assertions: [matches(/\b[345]\b/)], // tolerate any reasonable count
  }),
  evalCase({
    id: 'empty-ish',
    input: 'How many words: ""?',
    assertions: [matches(/\b0\b|\bzero\b/i)],
  }),
])

// Re-exported as `suite` so the CLI's mod.suite picks it up.
export { evalSuite as suite }
