import { describe, expect, test, beforeEach } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { memory } from '@vyntral/grove-core'
import { MemoryStore } from './memory.ts'

function fresh() {
  return new MemoryStore(mkdtempSync(join(tmpdir(), 'grove-mem-')))
}

describe('MemoryStore', () => {
  let store: MemoryStore
  beforeEach(() => {
    store = fresh()
  })

  test('ephemeral roundtrip — values are visible only within process', () => {
    const def = memory.ephemeral('notes')
    store.set(def, 'k', { a: 1 })
    expect(store.get(def, 'k')).toEqual({ a: 1 })
  })

  test('persistent roundtrip — values survive across MemoryStore instances', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grove-mem-persist-'))
    const a = new MemoryStore(dir)
    const def = memory.persistent('shared')
    a.set(def, 'foo', 42)
    a.close()

    const b = new MemoryStore(dir)
    expect(b.get(def, 'foo')).toBe(42)
  })

  test('session memory is namespaced per session id', () => {
    const def = memory.session('chat')
    store.set(def, 'msg', 'hi', 'session-1')
    expect(store.get(def, 'msg', 'session-1')).toBe('hi')
    expect(store.get(def, 'msg', 'session-2')).toBeUndefined()
  })

  test('clearSession wipes only its scope', () => {
    const def = memory.session('chat')
    store.set(def, 'm', 1, 'session-A')
    store.set(def, 'm', 2, 'session-B')
    store.clearSession('session-A')
    expect(store.get(def, 'm', 'session-A')).toBeUndefined()
    expect(store.get(def, 'm', 'session-B')).toBe(2)
  })

  test('list returns keys for the right scope', () => {
    const def = memory.persistent('list-test')
    store.set(def, 'a', 1)
    store.set(def, 'b', 2)
    expect(store.list(def).sort()).toEqual(['a', 'b'])
  })
})
