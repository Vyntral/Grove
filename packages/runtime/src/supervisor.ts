import type {
  AgentDef,
  ChildDef,
  RestartPolicy,
  RestartStrategy,
  SupervisorDef,
} from '@grove/core'
import { isSupervisor } from '@grove/core'
import { AgentProcess } from './process.ts'
import { getRecorder } from './recorder.ts'
import { installShutdown, onShutdown } from './shutdown.ts'
import type { ExecutorBackend, Process, ProcessStatus } from './types.ts'

interface ChildSlot {
  readonly def: ChildDef
  proc: Process
  /** index in declaration order (used by rest_for_one). */
  readonly index: number
}

/**
 * SupervisorProcess — Erlang/OTP-style supervisor.
 *
 * Strategies (mirrored from OTP):
 * - one_for_one  : restart only the failed child
 * - one_for_all  : restart all children when one fails
 * - rest_for_one : restart the failed child + all children declared after it
 *
 * Restart policy: if more than `restart.intensity` restarts occur within
 * `restart.period` ms, the supervisor itself crashes and bubbles up.
 *
 * This implements the canonical "let it crash" philosophy: process loops
 * never ignore errors — they propagate, and supervision decides.
 */
export class SupervisorProcess implements Process {
  readonly id: string
  readonly name: string
  readonly kind = 'supervisor' as const
  private state: ProcessStatus = 'starting'
  private slots: ChildSlot[] = []
  private restartTimes: number[] = []
  private rec = getRecorder()

  constructor(
    public readonly def: SupervisorDef,
    private backend?: ExecutorBackend,
  ) {
    this.id = `sup_${Math.random().toString(36).slice(2, 8)}`
    this.name = def.name
  }

  status(): ProcessStatus {
    return this.state
  }

  async start(): Promise<void> {
    this.slots = this.def.children.map((d, i) => ({
      def: d,
      proc: this.spawn(d),
      index: i,
    }))
    for (const slot of this.slots) await slot.proc.start()
    this.state = 'running'
    this.rec.emit({
      process: this.name,
      type: 'spawn',
      data: {
        id: this.id,
        kind: 'supervisor',
        strategy: this.def.strategy,
        children: this.slots.map((s) => s.proc.name),
      },
    })
  }

  async stop(): Promise<void> {
    this.state = 'stopped'
    for (const slot of this.slots) await slot.proc.stop()
    this.rec.emit({ process: this.name, type: 'stop', data: { id: this.id } })
  }

  /** Look up a child by name. */
  child(name: string): Process | undefined {
    return this.slots.find((s) => s.proc.name === name)?.proc
  }

  /**
   * Replace the definition of a named child and restart it. Used by the
   * hot-reload watcher; siblings keep running untouched.
   */
  async replace(name: string, nextDef: AgentDef): Promise<void> {
    const slot = this.slots.find((s) => s.proc.name === name)
    if (!slot) return
    if (slot.proc instanceof AgentProcess) slot.proc.markRestarting()
    await slot.proc.stop()
    // Mutate slot.def — slot is intentionally writable on `proc` for restart.
    ;(slot as { def: AgentDef }).def = nextDef
    slot.proc = this.spawn(nextDef)
    await slot.proc.start()
  }

  /**
   * Run an input through a named child agent, with supervised crash recovery.
   * If the child crashes, the supervisor applies its restart strategy and
   * surfaces the crash to the caller as a rejected promise.
   */
  async run<O = unknown>(input: unknown, opts?: { agent?: string }): Promise<O> {
    const slot =
      opts?.agent !== undefined
        ? this.slots.find((s) => s.proc.name === opts.agent)
        : this.slots[0]
    if (!slot) throw new Error(`no child found (agent=${opts?.agent ?? 'first'})`)

    try {
      return await slot.proc.run<O>(input)
    } catch (err) {
      // Mark crash on the affected process.
      if (slot.proc instanceof AgentProcess) slot.proc.markCrashed(err)
      this.applyRestart(slot, err)
      throw err
    }
  }

  /* ─── internals ────────────────────────────────────────────────── */

  private spawn(def: ChildDef): Process {
    if (isSupervisor(def)) return new SupervisorProcess(def, this.backend)
    return new AgentProcess(def as AgentDef, this.backend)
  }

  private applyRestart(failed: ChildSlot, err: unknown): void {
    const now = Date.now()
    this.restartTimes.push(now)
    this.restartTimes = this.restartTimes.filter(
      (t) => now - t <= this.def.restart.period,
    )
    if (this.restartTimes.length > this.def.restart.intensity) {
      this.rec.emit({
        process: this.name,
        type: 'crash',
        data: {
          reason: 'max_restart_intensity',
          intensity: this.def.restart.intensity,
          period: this.def.restart.period,
          inner: err instanceof Error ? err.message : String(err),
        },
      })
      this.state = 'crashed'
      return // bubbling up handled by parent supervisor (or main).
    }

    switch (this.def.strategy) {
      case 'one_for_one':
        this.restartChild(failed)
        break
      case 'one_for_all':
        for (const slot of this.slots) {
          if (slot.proc.status() !== 'stopped') void slot.proc.stop()
          this.restartChild(slot)
        }
        break
      case 'rest_for_one':
        for (const slot of this.slots) {
          if (slot.index < failed.index) continue
          if (slot.proc.status() !== 'stopped') void slot.proc.stop()
          this.restartChild(slot)
        }
        break
    }
  }

  private restartChild(slot: ChildSlot): void {
    if (slot.proc instanceof AgentProcess) slot.proc.markRestarting()
    slot.proc = this.spawn(slot.def)
    void slot.proc.start()
  }
}

/* ─── public start() entrypoint ─────────────────────────────────────── */

/**
 * Start a supervisor tree. Returns a handle you can `.run()` against and
 * eventually `.stop()`. Also creates a recorder session so the Bench can
 * see the run live.
 */
export async function start(
  tree: SupervisorDef | AgentDef,
  opts: { backend?: ExecutorBackend } = {},
): Promise<{
  handle: Process
  sessionId: string
  topology: object
}> {
  const rec = getRecorder()
  const topology = describeTopology(tree)
  const sessionId = rec.startSession(topology)

  const inner: Process = isSupervisor(tree)
    ? new SupervisorProcess(tree, opts.backend)
    : new AgentProcess(tree, opts.backend)

  // Thread the session id into every AgentProcess so memory_* tools can
  // scope correctly. Walk the tree once; cheap and runs only at start time.
  threadSessionId(inner, sessionId)

  await inner.start()

  // Patch stop() so the session is finalized in the recorder. We mutate
  // the inner process rather than wrapping it so SupervisorProcess-specific
  // methods (e.g. run with `{ agent: 'name' }`) remain accessible.
  const originalStop = inner.stop.bind(inner)
  let stopped = false
  inner.stop = async () => {
    if (stopped) return
    stopped = true
    await originalStop()
    rec.endSession(sessionId)
  }

  // Register graceful shutdown so SIGINT/SIGTERM stop the tree cleanly.
  installShutdown()
  onShutdown(() => inner.stop())

  return { handle: inner, sessionId, topology }
}

function threadSessionId(node: Process, sessionId: string): void {
  if (node instanceof AgentProcess) {
    node.sessionId = sessionId
    return
  }
  if (node instanceof SupervisorProcess) {
    for (const slot of (node as unknown as { slots: Array<{ proc: Process }> }).slots) {
      threadSessionId(slot.proc, sessionId)
    }
  }
}

function describeTopology(node: ChildDef): object {
  if (isSupervisor(node)) {
    return {
      kind: 'supervisor',
      name: node.name,
      strategy: node.strategy,
      restart: node.restart,
      children: node.children.map((c) => describeTopology(c)),
    }
  }
  return {
    kind: 'agent',
    name: node.name,
    model: node.model,
    tools: node.tools?.map((t) => t.name) ?? [],
    memory: node.memory ? { kind: node.memory.kind, key: node.memory.key } : null,
  }
}

export type { RestartStrategy, RestartPolicy }
