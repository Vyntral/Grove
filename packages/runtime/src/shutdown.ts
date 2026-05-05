/**
 * Graceful shutdown registry.
 *
 * Anything spawned by Grove that owns a resource (a supervisor, an MCP
 * child process, the recorder, a watcher) registers a `cleanup()` here.
 * On SIGINT/SIGTERM we run them in LIFO order with a per-cleanup timeout
 * so a hung handler can't strand the process.
 *
 * In tests, `installShutdown()` is a no-op when `process.env.GROVE_TEST=1`.
 */
type Cleanup = () => void | Promise<void>

const handlers: Cleanup[] = []
let installed = false
let inProgress = false

const PER_HANDLER_TIMEOUT_MS = 5_000

export function onShutdown(fn: Cleanup): () => void {
  handlers.push(fn)
  return () => {
    const i = handlers.lastIndexOf(fn)
    if (i >= 0) handlers.splice(i, 1)
  }
}

export function installShutdown(): void {
  if (installed) return
  installed = true

  // In real environments, hook the kill signals so SIGINT/SIGTERM run
  // cleanups before the process dies. In tests we skip the kill signals
  // (so the test runner isn't taken down) but still wire `beforeExit`
  // so the test suite can verify the registry works.
  if (process.env.GROVE_TEST !== '1') {
    const handle = (signal: string) => {
      if (inProgress) return
      inProgress = true
      void runHandlers(signal).then(() => {
        process.exit(signal === 'SIGTERM' ? 143 : 130)
      })
    }
    process.on('SIGINT', () => handle('SIGINT'))
    process.on('SIGTERM', () => handle('SIGTERM'))
  }

  process.on('beforeExit', () => {
    if (handlers.length === 0 || inProgress) return
    inProgress = true
    void runHandlers('beforeExit')
  })
}

/** Test-only: invoke handlers in LIFO order without requiring a real signal. */
export async function _runShutdownForTests(): Promise<void> {
  inProgress = true
  await runHandlers('test')
  inProgress = false
}

async function runHandlers(reason: string): Promise<void> {
  // Run in LIFO so children clean up before parents.
  const ordered = [...handlers].reverse()
  for (const fn of ordered) {
    try {
      await Promise.race([
        Promise.resolve().then(() => fn()),
        new Promise((resolve) =>
          setTimeout(() => resolve(undefined), PER_HANDLER_TIMEOUT_MS),
        ),
      ])
    } catch (err) {
      console.error(`[grove:shutdown:${reason}] handler threw`, err)
    }
  }
  handlers.length = 0
}
