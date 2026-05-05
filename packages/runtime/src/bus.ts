/**
 * Subject<T> — typed pub/sub channel used between processes and the recorder.
 *
 * Lightweight intentional re-implementation (no rxjs dependency) — Grove
 * needs only the subset: subscribe, next, complete.
 */
export class Subject<T> {
  private subscribers = new Set<(value: T) => void>()
  private isClosed = false

  subscribe(fn: (value: T) => void): () => void {
    if (this.isClosed) return () => {}
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  next(value: T): void {
    if (this.isClosed) return
    for (const fn of this.subscribers) {
      try {
        fn(value)
      } catch (err) {
        // Subscriber errors must never poison the bus
        console.error('[grove:bus] subscriber threw', err)
      }
    }
  }

  complete(): void {
    this.isClosed = true
    this.subscribers.clear()
  }
}

/** Mailbox — unbounded async queue read by an actor's main loop. */
export class Mailbox<T> {
  private queue: T[] = []
  private waiters: Array<(v: T) => void> = []
  private closed = false

  send(message: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter(message)
    else this.queue.push(message)
  }

  receive(): Promise<T> {
    if (this.closed) return Promise.reject(new Error('mailbox closed'))
    const next = this.queue.shift()
    if (next !== undefined) return Promise.resolve(next)
    return new Promise<T>((resolve) => this.waiters.push(resolve))
  }

  close(): void {
    this.closed = true
    this.queue = []
    this.waiters = []
  }
}
