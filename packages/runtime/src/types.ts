import type { AgentDef, StepRecord, SupervisorDef } from '@vyntral/grove-core'

export type ProcessStatus =
  | 'starting'
  | 'running'
  | 'crashed'
  | 'restarting'
  | 'stopped'

export interface Process {
  readonly id: string
  readonly name: string
  readonly kind: 'agent' | 'supervisor'
  status(): ProcessStatus
  start(): Promise<void>
  stop(): Promise<void>
  /**
   * Send the agent an input and await its completion. Resolves with the
   * final output; rejects on crash (after which the supervisor will
   * decide whether to restart).
   */
  run<O = unknown>(input: unknown): Promise<O>
}

export interface RuntimeEvent {
  readonly t: number
  readonly sessionId: string
  readonly process: string
  readonly type: StepRecord['kind'] | 'spawn' | 'stop'
  readonly data: unknown
}

export interface ExecutorBackend {
  /** Execute one model + tools loop turn. Returns final answer once steps stop. */
  execute(input: ExecuteInput): Promise<ExecuteOutput>
  /**
   * Stream the response token-by-token. Implementations should emit
   * `text_chunk` events to `input.emit` as text arrives, and return the
   * fully-assembled output when the stream completes. Optional — backends
   * that can't stream (e.g. MockBackend) may fall back to `execute()`.
   */
  stream?(input: ExecuteInput): Promise<ExecuteOutput>
}

export interface ExecuteInput {
  readonly agent: AgentDef
  readonly user: unknown
  readonly emit: (step: Omit<StepRecord, 'id' | 't' | 'agent'>) => void
}

export interface ExecuteOutput {
  readonly output: unknown
  readonly cost: { promptTokens: number; completionTokens: number; usd: number }
  readonly latencyMs: number
}

export type AnyChildDef = AgentDef | SupervisorDef
