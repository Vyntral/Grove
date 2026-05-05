import { describe, expect, test } from 'bun:test'
import { agent, supervise, tool } from '@grove/core'
import { prewarm } from './prewarm.ts'

describe('compiler prewarm', () => {
  test('runs declared examples for deterministic tools', async () => {
    let calls = 0
    const t = tool({
      name: 'square',
      description: 'square the number',
      deterministic: true,
      examples: [{ n: 2 }, { n: 3 }, { n: 4 }],
      run: ({ n }: { n: number }) => {
        calls += 1
        return n * n
      },
    })
    const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [t] })
    const tree = supervise({ children: [a] })

    const report = await prewarm(tree)
    expect(report.entries).toHaveLength(3)
    expect(calls).toBe(3)
    expect(report.entries[0]?.output).toBe(4)
    expect(report.entries[1]?.output).toBe(9)
    expect(report.entries[2]?.output).toBe(16)
  })

  test('skips non-deterministic tools', async () => {
    const t = tool({
      name: 'rand',
      description: '...',
      examples: [{ n: 1 }],
      run: () => Math.random(),
    })
    const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [t] })
    const tree = supervise({ children: [a] })
    const report = await prewarm(tree)
    expect(report.entries).toHaveLength(0)
  })

  test('errors during example execution are recorded but not thrown', async () => {
    const t = tool({
      name: 'fail',
      description: '...',
      deterministic: true,
      examples: [{ ok: false }],
      run: () => {
        throw new Error('boom')
      },
    })
    const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [t] })
    const tree = supervise({ children: [a] })
    const report = await prewarm(tree)
    expect(report.entries).toHaveLength(0)
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.reason).toContain('boom')
  })

  test('duplicate examples within a tool deduplicate', async () => {
    const t = tool({
      name: 'echo',
      description: '...',
      deterministic: true,
      examples: [{ x: 1 }, { x: 1 }, { x: 2 }],
      run: ({ x }: { x: number }) => x,
    })
    const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [t] })
    const tree = supervise({ children: [a] })
    const report = await prewarm(tree)
    expect(report.entries).toHaveLength(2)
  })
})
