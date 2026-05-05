import { describe, expect, test, beforeAll } from 'bun:test'
import { onShutdown, installShutdown, _runShutdownForTests } from './shutdown.ts'

beforeAll(() => {
  process.env.GROVE_TEST = '1'
  installShutdown()
})

describe('shutdown registry', () => {
  test('handlers fire in LIFO order', async () => {
    const calls: string[] = []
    onShutdown(() => {
      calls.push('a')
    })
    onShutdown(async () => {
      await new Promise((r) => setTimeout(r, 5))
      calls.push('b')
    })
    await _runShutdownForTests()
    // 'b' was registered after 'a', so it runs first.
    expect(calls).toEqual(['b', 'a'])
  })

  test('handler errors do not abort the chain', async () => {
    const calls: string[] = []
    onShutdown(() => {
      calls.push('first')
    })
    onShutdown(() => {
      throw new Error('boom')
    })
    onShutdown(() => {
      calls.push('last')
    })
    await _runShutdownForTests()
    expect(calls).toEqual(['last', 'first'])
  })
})
