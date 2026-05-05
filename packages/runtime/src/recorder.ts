import { Database } from 'bun:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Subject } from './bus.ts'
import type { RuntimeEvent } from './types.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  topology TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  process TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_events_session_t ON events(session_id, t);
`

export interface Session {
  readonly id: string
  readonly startedAt: number
  endedAt: number | null
  readonly events: ReadonlyArray<RuntimeEvent>
}

/**
 * Recorder — captures every runtime event into a SQLite database for
 * time-travel inspection. The Bench reads from this same DB.
 *
 * Storage path: `<cwd>/.grove/recordings.db`
 */
export class Recorder {
  private db: Database
  public readonly events = new Subject<RuntimeEvent>()
  private currentSessionId: string | null = null

  constructor(private dir = join(process.cwd(), '.grove')) {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    this.db = new Database(join(this.dir, 'recordings.db'))
    this.db.exec(SCHEMA)
  }

  startSession(topology: object): string {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.db
      .query('INSERT INTO sessions (id, started_at, topology) VALUES (?, ?, ?)')
      .run(id, Date.now(), JSON.stringify(topology))
    this.currentSessionId = id
    return id
  }

  endSession(id: string): void {
    this.db
      .query('UPDATE sessions SET ended_at = ? WHERE id = ?')
      .run(Date.now(), id)
    if (this.currentSessionId === id) this.currentSessionId = null
  }

  emit(ev: Omit<RuntimeEvent, 't' | 'sessionId'> & { sessionId?: string }): void {
    const sessionId = ev.sessionId ?? this.currentSessionId
    if (!sessionId) return
    const event: RuntimeEvent = { ...ev, t: Date.now(), sessionId }
    this.db
      .query('INSERT INTO events (session_id, t, process, type, data) VALUES (?, ?, ?, ?, ?)')
      .run(
        event.sessionId,
        event.t,
        event.process,
        event.type,
        JSON.stringify(event.data ?? null),
      )
    this.events.next(event)
  }

  getSession(id: string): Session | null {
    const session = this.db
      .query('SELECT * FROM sessions WHERE id = ?')
      .get(id) as { id: string; started_at: number; ended_at: number | null } | null
    if (!session) return null
    const rows = this.db
      .query('SELECT * FROM events WHERE session_id = ? ORDER BY t ASC')
      .all(id) as Array<{ session_id: string; t: number; process: string; type: string; data: string | null }>
    return {
      id: session.id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      events: rows.map((r) => ({
        sessionId: r.session_id,
        t: r.t,
        process: r.process,
        type: r.type as RuntimeEvent['type'],
        data: r.data ? JSON.parse(r.data) : null,
      })),
    }
  }

  listSessions(): Array<{ id: string; startedAt: number; endedAt: number | null }> {
    const rows = this.db
      .query('SELECT id, started_at, ended_at FROM sessions ORDER BY started_at DESC LIMIT 200')
      .all() as Array<{ id: string; started_at: number; ended_at: number | null }>
    return rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    }))
  }

  /**
   * Aggregate stats across the recorder DB. Used by `grove cache --stats`
   * to give devs a quick view of what's accumulating on disk.
   */
  stats(): {
    sessions: number
    events: number
    oldestAt: number | null
    newestAt: number | null
    sizeBytes: number
  } {
    const sessRow = this.db
      .query('SELECT COUNT(*) as n, MIN(started_at) as oldest, MAX(started_at) as newest FROM sessions')
      .get() as { n: number; oldest: number | null; newest: number | null }
    const evRow = this.db
      .query('SELECT COUNT(*) as n FROM events')
      .get() as { n: number }
    let size = 0
    try {
      const fs = require('node:fs') as typeof import('node:fs')
      const path = require('node:path') as typeof import('node:path')
      size = fs.statSync(path.join(this.dir, 'recordings.db')).size
    } catch {}
    return {
      sessions: sessRow.n,
      events: evRow.n,
      oldestAt: sessRow.oldest,
      newestAt: sessRow.newest,
      sizeBytes: size,
    }
  }

  /**
   * Drop sessions older than `olderThanMs` (default 7 days). Returns the
   * number of sessions removed. Cascades to events table.
   */
  purge(olderThanMs = 7 * 24 * 60 * 60_000): number {
    const cutoff = Date.now() - olderThanMs
    const ids = this.db
      .query('SELECT id FROM sessions WHERE started_at < ?')
      .all(cutoff) as Array<{ id: string }>
    if (ids.length === 0) return 0
    this.db.exec('BEGIN')
    try {
      const placeholders = ids.map(() => '?').join(',')
      this.db
        .query(`DELETE FROM events WHERE session_id IN (${placeholders})`)
        .run(...ids.map((i) => i.id))
      this.db
        .query(`DELETE FROM sessions WHERE id IN (${placeholders})`)
        .run(...ids.map((i) => i.id))
      this.db.exec('COMMIT')
      this.db.exec('VACUUM')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
    return ids.length
  }

  /** Wipe everything. Used by `grove cache --clear`. */
  clear(): void {
    this.db.exec('DELETE FROM events')
    this.db.exec('DELETE FROM sessions')
    this.db.exec('VACUUM')
  }

  /**
   * Create a new session that adopts another session's prefix verbatim.
   * Used by `grove fork load` — the events copied in retain their original
   * timestamps + payloads, so timeline scrubbing in the Bench shows the
   * inherited history before any new events land. Returns the new id.
   */
  forkSession(parentSessionId: string, throughIndex: number): string | null {
    const parent = this.getSession(parentSessionId)
    if (!parent) return null
    const prefix = parent.events.slice(0, throughIndex + 1)

    const id = `s_fork_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const topology = this.db
      .query('SELECT topology FROM sessions WHERE id = ?')
      .get(parentSessionId) as { topology: string | null } | null
    this.db
      .query('INSERT INTO sessions (id, started_at, topology) VALUES (?, ?, ?)')
      .run(id, Date.now(), topology?.topology ?? null)

    const insert = this.db.query(
      'INSERT INTO events (session_id, t, process, type, data) VALUES (?, ?, ?, ?, ?)',
    )
    for (const ev of prefix) {
      insert.run(id, ev.t, ev.process, ev.type, JSON.stringify(ev.data ?? null))
    }
    // Stamp a synthetic event so the fork is self-describing.
    insert.run(
      id,
      Date.now(),
      '<fork>',
      'message',
      JSON.stringify({
        kind: 'fork_loaded',
        parent: parentSessionId,
        throughIndex,
        eventsCopied: prefix.length,
      }),
    )
    return id
  }

  close(): void {
    this.db.close()
    this.events.complete()
  }
}

/** Process-wide singleton. */
let _recorder: Recorder | null = null
export function getRecorder(): Recorder {
  if (!_recorder) _recorder = new Recorder()
  return _recorder
}
