import type { MemoryDef, MemoryKind, SchemaLike } from './types.ts'

interface MemoryFactoryInput {
  readonly key: string
  readonly schema?: SchemaLike<unknown>
}

function make(kind: MemoryKind) {
  return (input: string | MemoryFactoryInput): MemoryDef => {
    const spec: MemoryFactoryInput =
      typeof input === 'string' ? { key: input } : input
    return {
      _grove: 'memory',
      kind,
      key: spec.key,
      schema: spec.schema,
    }
  }
}

/**
 * Memory factories.
 *
 * - `memory.ephemeral(key)` — wiped at process exit. Useful for scratchpads.
 * - `memory.session(key)`   — persists for the lifetime of a supervisor session.
 * - `memory.persistent(key)`— durable across runs, stored in `.grove/memory/`.
 *
 * @example
 *   const notes = memory.persistent('research-notes')
 */
export const memory = {
  ephemeral: make('ephemeral'),
  session: make('session'),
  persistent: make('persistent'),
}

export function isMemory(value: unknown): value is MemoryDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _grove?: unknown })._grove === 'memory'
  )
}
