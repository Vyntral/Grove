import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  key TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_hit_at INTEGER,
  hits INTEGER NOT NULL DEFAULT 0,
  cost_saved_usd REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entries_tool ON entries(tool);
`

export interface CacheStats {
  readonly entries: number
  readonly hits: number
  readonly misses: number
  readonly savedUsd: number
  readonly hitRate: number
}

/**
 * Deterministic-tool cache.
 *
 * Two storage layers:
 * - SQLite (`.grove/cache.db`) — durable across runs
 * - In-memory counters — current-session hit/miss totals
 *
 * Keying: `sha256(tool.name : canonical-json(input))`. Canonical JSON sorts
 * object keys recursively so semantically-equal inputs share a key
 * regardless of property order.
 */
export interface CacheConfig {
  /** Hard cap on entries. Older + less-recently-hit get evicted first. */
  readonly maxEntries?: number
}

const DEFAULT_MAX_ENTRIES = 10_000

export class DeterministicCache {
  private db: Database
  private sessionHits = 0
  private sessionMisses = 0
  private sessionSavedUsd = 0
  private maxEntries: number

  constructor(
    dir = join(process.cwd(), '.grove'),
    config: CacheConfig = {},
  ) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, 'cache.db'))
    this.db.exec(SCHEMA)
    const envMax = process.env.GROVE_CACHE_MAX_ENTRIES
    this.maxEntries =
      config.maxEntries ?? (envMax ? Number(envMax) : DEFAULT_MAX_ENTRIES)
  }

  /** Hash a (tool, input) pair into a stable key. */
  key(tool: string, input: unknown): string {
    const canon = canonicalize(input)
    return createHash('sha256').update(`${tool}:${canon}`).digest('hex').slice(0, 32)
  }

  /**
   * Look up a previously cached output. Returns the parsed value or `undefined`
   * on a miss. Updates session-local hit/miss counters.
   */
  get(tool: string, input: unknown): unknown | undefined {
    const k = this.key(tool, input)
    const row = this.db
      .query('SELECT output FROM entries WHERE key = ?')
      .get(k) as { output: string } | null
    if (!row) {
      this.sessionMisses += 1
      return undefined
    }
    this.sessionHits += 1
    this.db
      .query('UPDATE entries SET hits = hits + 1, last_hit_at = ? WHERE key = ?')
      .run(Date.now(), k)
    return JSON.parse(row.output)
  }

  /**
   * Persist a new entry. `costSavedPerHitUsd` is the projected cost of this
   * call — used to track total $ saved across hits in `stats()`.
   *
   * Auto-evicts entries when the cache exceeds `maxEntries`. Eviction
   * order: least-recently-hit first (via `last_hit_at`), then oldest.
   */
  set(
    tool: string,
    input: unknown,
    output: unknown,
    costSavedPerHitUsd = 0,
  ): void {
    const k = this.key(tool, input)
    this.db
      .query(
        'INSERT OR REPLACE INTO entries (key, tool, output, created_at, cost_saved_usd) VALUES (?, ?, ?, ?, ?)',
      )
      .run(k, tool, JSON.stringify(output), Date.now(), costSavedPerHitUsd)
    this.maybeEvict()
  }

  private maybeEvict(): void {
    const total = (
      this.db.query('SELECT COUNT(*) as n FROM entries').get() as { n: number }
    ).n
    if (total <= this.maxEntries) return
    const toRemove = total - this.maxEntries
    this.db
      .query(
        `DELETE FROM entries WHERE key IN (
          SELECT key FROM entries
          ORDER BY COALESCE(last_hit_at, created_at) ASC
          LIMIT ?
        )`,
      )
      .run(toRemove)
  }

  recordHitSavings(usd: number): void {
    this.sessionSavedUsd += usd
  }

  /** Aggregate stats across the cache + current session. */
  stats(): CacheStats {
    const total = this.db
      .query('SELECT COUNT(*) as n FROM entries')
      .get() as { n: number }
    const saved = this.db
      .query('SELECT COALESCE(SUM(hits * cost_saved_usd), 0) as s FROM entries')
      .get() as { s: number }
    const ratio =
      this.sessionHits + this.sessionMisses === 0
        ? 0
        : this.sessionHits / (this.sessionHits + this.sessionMisses)
    return {
      entries: total.n,
      hits: this.sessionHits,
      misses: this.sessionMisses,
      savedUsd: saved.s + this.sessionSavedUsd,
      hitRate: ratio,
    }
  }

  /** Override the eviction cap at runtime (used by tests). */
  setMaxEntries(n: number): void {
    this.maxEntries = n
    this.maybeEvict()
  }

  /**
   * Bulk-insert prewarm entries produced by the compiler. The cache treats
   * each `(tool, input)` as a fresh write — duplicate keys are upserted, so
   * re-running compile is idempotent.
   */
  prewarm(
    entries: ReadonlyArray<{ tool: string; input: unknown; output: unknown }>,
  ): void {
    for (const e of entries) this.set(e.tool, e.input, e.output, 0)
  }

  /** Wipe everything. Useful in tests and for `grove cache --clear`. */
  reset(): void {
    this.db.exec('DELETE FROM entries')
    this.sessionHits = 0
    this.sessionMisses = 0
    this.sessionSavedUsd = 0
  }

  close(): void {
    this.db.close()
  }
}

/* ─── canonical JSON for stable hashing ────────────────────────────── */

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  )
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
}

/* ─── singleton ─────────────────────────────────────────────────────── */

let _cache: DeterministicCache | null = null
export function getCache(): DeterministicCache {
  if (!_cache) _cache = new DeterministicCache()
  return _cache
}
