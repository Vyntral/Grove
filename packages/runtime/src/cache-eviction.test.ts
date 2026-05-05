import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeterministicCache } from './cache.ts'

function fresh(maxEntries: number) {
  return new DeterministicCache(
    mkdtempSync(join(tmpdir(), 'grove-cache-evict-')),
    { maxEntries },
  )
}

describe('cache eviction', () => {
  test('writes beyond cap drop the oldest entry', () => {
    const cache = fresh(3)
    cache.set('t', { i: 1 }, 'one')
    cache.set('t', { i: 2 }, 'two')
    cache.set('t', { i: 3 }, 'three')
    cache.set('t', { i: 4 }, 'four') // should evict {i:1}

    expect(cache.get('t', { i: 1 })).toBeUndefined()
    expect(cache.get('t', { i: 4 })).toBe('four')
  })

  test('hits update last_hit_at — recently-used entries survive eviction', () => {
    const cache = fresh(3)
    cache.set('t', { i: 1 }, 'one')
    cache.set('t', { i: 2 }, 'two')
    cache.set('t', { i: 3 }, 'three')

    // Touch entry 1 to make it the most recently hit.
    expect(cache.get('t', { i: 1 })).toBe('one')

    // Now writing entry 4 should evict the least-recently-touched (entry 2).
    cache.set('t', { i: 4 }, 'four')

    expect(cache.get('t', { i: 1 })).toBe('one') // survived
    expect(cache.get('t', { i: 2 })).toBeUndefined() // evicted
  })

  test('setMaxEntries trims down to the new cap immediately', () => {
    const cache = fresh(10)
    for (let i = 0; i < 5; i++) cache.set('t', { i }, `v${i}`)
    cache.setMaxEntries(2)
    expect(cache.stats().entries).toBe(2)
  })

  test('prewarm bulk-inserts and respects eviction', () => {
    const cache = fresh(2)
    cache.prewarm([
      { tool: 't', input: { i: 1 }, output: 'one' },
      { tool: 't', input: { i: 2 }, output: 'two' },
      { tool: 't', input: { i: 3 }, output: 'three' },
    ])
    expect(cache.stats().entries).toBe(2)
  })
})
