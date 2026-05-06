import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryDef, MemoryKind, ToolDef } from '@vyntral/grove-core'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory (
  scope TEXT NOT NULL,
  ns TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  written_at INTEGER NOT NULL,
  PRIMARY KEY (scope, ns, k)
);
CREATE INDEX IF NOT EXISTS idx_memory_scope_ns ON memory(scope, ns);
`

/**
 * MemoryStore — backs the `memory.{ephemeral,session,persistent}(key)`
 * primitive. Three storage tiers share the same on-disk SQLite (under
 * `.grove/memory.db`) but distinguish lifetime via the `scope` column:
 *
 *   - `ephemeral`  : process-local in-memory Map; never touches disk.
 *   - `session`    : SQLite, namespaced per session id, deleted on stop.
 *   - `persistent` : SQLite, namespaced by `MemoryDef.key`, durable.
 *
 * Keys inside a memory namespace (`get`, `set`, `delete`, `list`) are
 * arbitrary strings. Values are JSON-serialisable.
 */
export class MemoryStore {
  private db: Database
  private ephemeral = new Map<string, unknown>() // ns:key → value

  constructor(private dir = join(process.cwd(), '.grove')) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, 'memory.db'))
    this.db.exec(SCHEMA)
  }

  get(def: MemoryDef, k: string, sessionId?: string): unknown {
    if (def.kind === 'ephemeral') {
      return this.ephemeral.get(`${def.key}:${k}`)
    }
    const scope = scopeOf(def.kind, def.key, sessionId)
    const row = this.db
      .query('SELECT v FROM memory WHERE scope = ? AND ns = ? AND k = ?')
      .get(scope, def.key, k) as { v: string } | null
    return row ? JSON.parse(row.v) : undefined
  }

  set(def: MemoryDef, k: string, value: unknown, sessionId?: string): void {
    if (def.kind === 'ephemeral') {
      this.ephemeral.set(`${def.key}:${k}`, value)
      return
    }
    const scope = scopeOf(def.kind, def.key, sessionId)
    this.db
      .query(
        `INSERT INTO memory (scope, ns, k, v, written_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope, ns, k) DO UPDATE SET v = excluded.v, written_at = excluded.written_at`,
      )
      .run(scope, def.key, k, JSON.stringify(value), Date.now())
  }

  delete(def: MemoryDef, k: string, sessionId?: string): void {
    if (def.kind === 'ephemeral') {
      this.ephemeral.delete(`${def.key}:${k}`)
      return
    }
    const scope = scopeOf(def.kind, def.key, sessionId)
    this.db
      .query('DELETE FROM memory WHERE scope = ? AND ns = ? AND k = ?')
      .run(scope, def.key, k)
  }

  list(def: MemoryDef, sessionId?: string): string[] {
    if (def.kind === 'ephemeral') {
      const prefix = `${def.key}:`
      const out: string[] = []
      for (const k of this.ephemeral.keys()) {
        if (k.startsWith(prefix)) out.push(k.slice(prefix.length))
      }
      return out
    }
    const scope = scopeOf(def.kind, def.key, sessionId)
    const rows = this.db
      .query('SELECT k FROM memory WHERE scope = ? AND ns = ?')
      .all(scope, def.key) as Array<{ k: string }>
    return rows.map((r) => r.k)
  }

  /** Drop every entry in a session scope — called when supervisors stop. */
  clearSession(sessionId: string): void {
    this.db
      .query('DELETE FROM memory WHERE scope = ?')
      .run(`session:${sessionId}`)
  }

  close(): void {
    this.db.close()
    this.ephemeral.clear()
  }
}

function scopeOf(kind: MemoryKind, key: string, sessionId?: string): string {
  if (kind === 'session') {
    if (!sessionId) throw new Error('[grove] session memory needs a sessionId')
    return `session:${sessionId}`
  }
  if (kind === 'persistent') return `persistent:${key}`
  return `ephemeral:${key}`
}

/* ─── singleton ─────────────────────────────────────────────────────── */

let _store: MemoryStore | null = null
export function getMemoryStore(): MemoryStore {
  if (!_store) _store = new MemoryStore()
  return _store
}

/* ─── tool injection ───────────────────────────────────────────────── */

/**
 * Build the three implicit tools an agent gets when it declares `memory`.
 * The returned tools share the agent's session id (closed over at start
 * time, threaded through the executor).
 */
export function memoryTools(
  def: MemoryDef,
  sessionId: string | undefined,
): ToolDef[] {
  const store = getMemoryStore()
  const ns = def.key

  // We need a structural schema-like for AI SDK. We rely on JSON-Schema
  // pass-through (the executor already supports `_jsonSchema` adapt).
  const schemaWithJson = (jsonSchema: object) =>
    ({
      safeParse: (v: unknown) => ({ success: true as const, data: v }),
      _jsonSchema: jsonSchema,
    }) as unknown as ToolDef['schema']

  return [
    {
      _grove: 'tool' as const,
      name: 'memory_get',
      description: `Read a key from this agent's memory namespace ("${ns}", ${def.kind}). Returns the JSON value or null if missing.`,
      schema: schemaWithJson({
        type: 'object',
        properties: { key: { type: 'string' } },
        required: ['key'],
        additionalProperties: false,
      }),
      deterministic: false,
      run: ((args: { key: string }) => {
        const v = store.get(def, args.key, sessionId)
        return v === undefined ? null : v
      }) as ToolDef['run'],
    },
    {
      _grove: 'tool' as const,
      name: 'memory_set',
      description: `Write a value under a key in this agent's memory namespace ("${ns}", ${def.kind}). Returns "ok".`,
      schema: schemaWithJson({
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: {}, // any JSON
        },
        required: ['key', 'value'],
        additionalProperties: false,
      }),
      deterministic: false,
      run: ((args: { key: string; value: unknown }) => {
        store.set(def, args.key, args.value, sessionId)
        return 'ok'
      }) as ToolDef['run'],
    },
    {
      _grove: 'tool' as const,
      name: 'memory_list',
      description: `List the keys currently set in this agent's memory namespace ("${ns}", ${def.kind}).`,
      schema: schemaWithJson({
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      deterministic: false,
      run: (() => store.list(def, sessionId)) as ToolDef['run'],
    },
  ]
}
