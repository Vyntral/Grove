import { describe, expect, test, beforeEach } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agent, supervise, tool } from '@vyntral/grove-core'
import { z } from 'zod'
import { start } from './supervisor.ts'
import { MockBackend } from './executor.ts'
import { DeterministicCache, getCache } from './cache.ts'
import { getRecorder } from './recorder.ts'

describe('cache', () => {
  beforeEach(() => {
    getCache().reset()
  })

  test('canonical hashing — key order does not matter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grove-cache-'))
    const cache = new DeterministicCache(dir)
    const k1 = cache.key('t', { a: 1, b: 2 })
    const k2 = cache.key('t', { b: 2, a: 1 })
    expect(k1).toBe(k2)
  })

  test('different inputs produce different keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grove-cache-'))
    const cache = new DeterministicCache(dir)
    expect(cache.key('t', { a: 1 })).not.toBe(cache.key('t', { a: 2 }))
    expect(cache.key('t1', { a: 1 })).not.toBe(cache.key('t2', { a: 1 }))
  })

  test('roundtrips arbitrary JSON values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grove-cache-'))
    const cache = new DeterministicCache(dir)
    cache.set('t', { x: 1 }, { result: 'ok', items: [1, 2] })
    expect(cache.get('t', { x: 1 })).toEqual({ result: 'ok', items: [1, 2] })
  })

  test('emits cache_hit on second deterministic call with same input', async () => {
    let calls = 0
    const lookup = tool({
      name: 'lookup',
      description: '…',
      schema: z.object({ id: z.string() }),
      deterministic: true,
      run: ({ id }) => {
        calls += 1
        return `value-${id}`
      },
    })
    const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [lookup] })
    const tree = supervise({ name: 'r', children: [a] })
    const { handle, sessionId } = await start(tree, { backend: new MockBackend() })

    await handle.run({ id: 'x' })
    await handle.run({ id: 'x' })
    await handle.stop()

    expect(calls).toBe(1) // executed only once
    const session = getRecorder().getSession(sessionId)!
    const types = session.events.map((e) => e.type)
    expect(types).toContain('cache_miss')
    expect(types).toContain('cache_hit')
  })

  test('non-deterministic tools never cache', async () => {
    let calls = 0
    const ticker = tool({
      name: 'ticker',
      description: '…',
      schema: z.object({ id: z.string() }),
      deterministic: false,
      run: ({ id }) => {
        calls += 1
        return `tick-${id}-${calls}`
      },
    })
    const a = agent({ name: 'a', model: 'openai/gpt-5.5', tools: [ticker] })
    const tree = supervise({ name: 'r', children: [a] })
    const { handle } = await start(tree, { backend: new MockBackend() })

    await handle.run({ id: 'x' })
    await handle.run({ id: 'x' })
    await handle.stop()

    expect(calls).toBe(2)
  })

  test('reset() empties the cache', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grove-cache-'))
    const cache = new DeterministicCache(dir)
    cache.set('t', { a: 1 }, 'v')
    expect(cache.get('t', { a: 1 })).toBe('v')
    cache.reset()
    expect(cache.get('t', { a: 1 })).toBeUndefined()
  })
})
