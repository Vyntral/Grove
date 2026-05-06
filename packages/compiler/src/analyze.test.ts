import { describe, expect, test } from 'bun:test'
import { agent, supervise, tool } from '@vyntral/grove-core'
import { z } from 'zod'
import { analyse, isDeterministicTool } from './analyze.ts'

describe('compiler/analyse', () => {
  test('explicit deterministic flag wins', () => {
    const t = tool({
      name: 'side-effecting-name',
      description: '…',
      schema: z.object({}),
      deterministic: true,
      run: () => 1,
    })
    expect(isDeterministicTool(t)).toBe(true)
  })

  test('heuristic recognises pure-sounding names', () => {
    const t = tool({
      name: 'parse-json',
      description: '…',
      run: () => ({}),
    })
    expect(isDeterministicTool(t)).toBe(true)
  })

  test('heuristic abstains when uncertain', () => {
    const t = tool({
      name: 'send-email',
      description: '…',
      run: () => null,
    })
    expect(isDeterministicTool(t)).toBe(false)
  })

  test('per-agent determinism score reflects tool ratio', () => {
    const a = agent({
      name: 'mixed',
      model: 'openai/gpt-5.5',
      tools: [
        tool({ name: 'parse', description: '', run: () => 1 }),
        tool({ name: 'send-email', description: '', run: () => 1 }),
      ],
    })
    const tree = supervise({ children: [a] })
    const result = analyse(tree)
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0]!.determinismScore).toBe(0.5)
  })

  test('compile reduces projected cost', () => {
    const a = agent({
      name: 'cheap',
      model: 'anthropic/claude-haiku-4-5',
      tools: [tool({ name: 'parse', description: '', deterministic: true, run: () => 1 })],
    })
    const tree = supervise({ children: [a] })
    const result = analyse(tree)
    expect(result.compiledCostPerRunUsd).toBeLessThan(result.totalCostPerRunUsd)
    expect(result.costReductionX).toBeGreaterThan(1)
  })
})
