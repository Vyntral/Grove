import type { AgentDef, StepRecord } from '@grove/core'
import { Mailbox } from './bus.ts'
import { executeAgent } from './executor.ts'
import { getRecorder } from './recorder.ts'
import { memoryTools } from './memory.ts'
import type { ExecutorBackend, Process, ProcessStatus } from './types.ts'

let processCounter = 0
const nextId = (prefix: string) => `${prefix}_${++processCounter}_${Math.random().toString(36).slice(2, 6)}`
const nextStepId = () => `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

/**
 * AgentProcess — the runtime instance of an `AgentDef`.
 *
 * Owns a mailbox, an in-flight promise, and reports lifecycle events to
 * the recorder. Crashes propagate to the parent supervisor.
 */
export class AgentProcess implements Process {
  readonly id: string
  readonly name: string
  readonly kind = 'agent' as const
  private state: ProcessStatus = 'starting'
  private mailbox = new Mailbox<unknown>()
  private rec = getRecorder()

  /** Set by the supervisor at start time so memory tools can scope. */
  sessionId: string | undefined

  constructor(
    public readonly def: AgentDef,
    private backend?: ExecutorBackend,
  ) {
    this.id = nextId('agent')
    this.name = def.name
  }

  status(): ProcessStatus {
    return this.state
  }

  async start(): Promise<void> {
    this.state = 'running'
    this.rec.emit({
      process: this.name,
      type: 'spawn',
      data: { id: this.id, kind: 'agent', model: this.def.model },
    })
  }

  async stop(): Promise<void> {
    this.state = 'stopped'
    this.mailbox.close()
    this.rec.emit({ process: this.name, type: 'stop', data: { id: this.id } })
  }

  async run<O = unknown>(input: unknown): Promise<O> {
    if (this.state !== 'running') {
      throw new Error(`agent ${this.name} not running (state=${this.state})`)
    }
    // Inject the implicit memory_* tools when the agent declares memory.
    // We materialise a copy of the def so the original (user-authored)
    // value stays unchanged — keeps the public API predictable.
    const effective = this.def.memory
      ? {
          ...this.def,
          tools: [...(this.def.tools ?? []), ...memoryTools(this.def.memory, this.sessionId)],
        }
      : this.def
    const result = await executeAgent(
      effective,
      input,
      (step) => {
        const record: StepRecord = {
          id: nextStepId(),
          t: Date.now(),
          agent: this.name,
          ...step,
        }
        this.rec.emit({
          process: this.name,
          type: record.kind,
          data: { stepId: record.id, ...record.data as object },
        })
      },
      this.backend,
    )
    return result.output as O
  }

  /** Used by the supervisor to mark a process crashed before restarting. */
  markCrashed(error: unknown): void {
    this.state = 'crashed'
    this.rec.emit({
      process: this.name,
      type: 'crash',
      data: { error: error instanceof Error ? error.message : String(error) },
    })
  }

  markRestarting(): void {
    this.state = 'restarting'
    this.rec.emit({ process: this.name, type: 'restart', data: { id: this.id } })
  }
}
