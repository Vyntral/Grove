/**
 * research.ts — multi-agent topology fit for the compiler.
 *
 *   bun packages/examples/src/research.ts          # run
 *   grove compile packages/examples/src/research.ts   # analyse
 *
 * Demonstrates a research → write pipeline with several deterministic tools.
 * Run `grove compile` against this file to see the cost projection drop.
 */
import { agent, supervise, tool } from '@grove/core'
import { start } from '@grove/runtime'
import { z } from 'zod'

const search = tool({
  name: 'search',
  description: 'Return canned search results for a query.',
  schema: z.object({ query: z.string() }),
  deterministic: true,
  examples: [
    { query: 'sparse attention' },
    { query: 'agent supervision' },
    { query: 'compiler prewarm' },
  ],
  run: ({ query }) => [
    `[1] result about "${query}"`,
    `[2] another about "${query}"`,
    `[3] background on "${query}"`,
  ],
})

const extractKeywords = tool({
  name: 'extract-keywords',
  description: 'Extract top keywords from text.',
  schema: z.object({ text: z.string() }),
  deterministic: true,
  run: ({ text }) => text.split(/\W+/).filter((w) => w.length > 4).slice(0, 5),
})

const formatReport = tool({
  name: 'format-report',
  description: 'Format research findings into a structured report.',
  schema: z.object({ topic: z.string(), findings: z.array(z.string()) }),
  deterministic: true,
  run: ({ topic, findings }) => ({
    title: `Report: ${topic}`,
    summary: findings.slice(0, 3).join(' · '),
    findings,
  }),
})

const researcher = agent({
  name: 'researcher',
  model: 'anthropic/claude-opus-4-7',
  system: 'You research topics rigorously and surface key findings.',
  tools: [search, extractKeywords],
  maxSteps: 8,
})

const writer = agent({
  name: 'writer',
  model: 'anthropic/claude-sonnet-4-6',
  system: 'You turn research findings into structured reports.',
  tools: [formatReport],
  maxSteps: 4,
})

export const tree = supervise({
  name: 'research-pipeline',
  strategy: 'rest_for_one',
  children: [researcher, writer],
  restart: { intensity: 3, period: 30_000 },
})

if (import.meta.main) {
  const { handle } = await start(tree)
  const result = await handle.run({ query: 'sparse attention' })
  console.log('output:', result)
  await handle.stop()
}
