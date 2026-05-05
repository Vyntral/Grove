/**
 * Structural alias for a Zod (or Zod-compatible) schema. We avoid importing
 * `zod` directly so the public types remain stable across Zod major versions.
 * Any object exposing `safeParse(input)` works.
 */
export interface SchemaLike<T = unknown> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown }
  parse?(input: unknown): T
}

/**
 * The brand symbol used to tag Grove primitives at the type level.
 * Lets the runtime distinguish a plain object from a Grove-built artifact
 * without runtime imports of zod or the runtime package.
 */
export type GroveBrand =
  | 'tool'
  | 'agent'
  | 'memory'
  | 'supervisor'
  | 'session'

/* ─── Tool ─────────────────────────────────────────────────────────── */

export interface ToolDef<I = unknown, O = unknown> {
  readonly _grove: 'tool'
  readonly name: string
  readonly description: string
  readonly schema?: SchemaLike<I>
  readonly run: (input: I) => Promise<O> | O
  /** Marks this tool as deterministic for the compiler (cacheable on identical input). */
  readonly deterministic?: boolean
  /**
   * Inputs the compiler should pre-execute and store in the cache during
   * `grove compile`. Only meaningful when `deterministic: true` — otherwise
   * the values would mismatch at runtime. Each example is a full input
   * matching `schema`. Compile-time errors aren't fatal (they're logged).
   */
  readonly examples?: ReadonlyArray<I>
}

/* ─── Memory ───────────────────────────────────────────────────────── */

export type MemoryKind = 'ephemeral' | 'session' | 'persistent'

export interface MemoryDef {
  readonly _grove: 'memory'
  readonly kind: MemoryKind
  readonly key: string
  /** Optional schema describing memory shape — used by the Bench inspector. */
  readonly schema?: SchemaLike<unknown>
}

/* ─── Agent ────────────────────────────────────────────────────────── */

/**
 * AI Gateway-style provider/model identifier.
 * Examples: 'anthropic/claude-opus-4-7', 'openai/gpt-5.5', 'google/gemini-3.1-pro'
 */
export type ModelId = `${string}/${string}`

// Tools are heterogeneously typed at definition site; the array container
// uses `any` element types to avoid contravariance pain. Per-tool type
// safety is preserved via `tool({...})` factory inference.
export type AnyTool = ToolDef<any, any>

export interface AgentDef {
  readonly _grove: 'agent'
  readonly name: string
  readonly model: ModelId
  readonly system?: string
  readonly prompt?: string
  readonly tools?: ReadonlyArray<AnyTool>
  readonly memory?: MemoryDef
  readonly maxSteps?: number
  readonly temperature?: number
  /** Optional behaviour invariants the bench/eval runner can check. */
  readonly invariants?: ReadonlyArray<string>
  /**
   * Provider-level caching hints.
   *
   * For anthropic/* models, Grove auto-applies `cache_control: ephemeral`
   * breakpoints on the system prompt when it is large enough (≥1024 chars
   * by default). Set to `false` to opt out, or pass an object to override.
   */
  readonly cache?: boolean | AgentCacheConfig
  /**
   * Per-call timeout in milliseconds. The backend aborts after this and
   * the recorder logs a `crash` event with reason `timeout`. Default 60s.
   */
  readonly timeout?: number
  /**
   * Max retry attempts on retriable errors (5xx, 429, network). Uses
   * exponential backoff (200ms × 2^n + jitter). Default 2 retries.
   */
  readonly retries?: number
  /**
   * Enable token-by-token streaming. When true, `handle.run(input)`
   * returns the final string but the recorder also emits `text_chunk`
   * events as the model produces them. The dev can additionally call
   * `handle.runStream(input)` for an `AsyncIterable<string>`.
   */
  readonly stream?: boolean
}

export interface AgentCacheConfig {
  /** Cache the system prompt (default: true if length ≥ minSystemChars). */
  readonly system?: boolean
  /** Minimum system prompt size to enable caching (default: 1024). */
  readonly minSystemChars?: number
  /** Cache TTL — '5m' is default, '1h' available on premium plans. */
  readonly ttl?: '5m' | '1h'
}

/* ─── Supervisor ───────────────────────────────────────────────────── */

export type RestartStrategy = 'one_for_one' | 'one_for_all' | 'rest_for_one'

export interface RestartPolicy {
  /** Max number of restarts within the period before the supervisor itself gives up. */
  readonly intensity: number
  /** Time window in milliseconds for counting restarts. */
  readonly period: number
}

export type ChildDef = AgentDef | SupervisorDef

export interface SupervisorDef {
  readonly _grove: 'supervisor'
  readonly name: string
  readonly strategy: RestartStrategy
  readonly children: ReadonlyArray<ChildDef>
  readonly restart: RestartPolicy
}

/* ─── Runtime contracts (implemented by @grove/runtime) ────────────── */

export interface AgentRunInput {
  readonly input: unknown
  readonly correlationId?: string
}

export interface AgentRunResult<O = unknown> {
  readonly output: O
  readonly steps: ReadonlyArray<StepRecord>
  readonly cost: { promptTokens: number; completionTokens: number; usd: number }
  readonly latencyMs: number
  readonly sessionId: string
}

export interface StepRecord {
  readonly id: string
  readonly t: number
  readonly kind:
    | 'message'
    | 'tool_call'
    | 'tool_result'
    | 'model_call'
    | 'crash'
    | 'restart'
    | 'cache_hit'
    | 'cache_miss'
    | 'hot_reload'
    | 'prompt_cache'
    | 'retry'
    | 'timeout'
    | 'text_chunk'
  readonly agent: string
  readonly data: unknown
}

/** A handle returned by the runtime when starting a supervisor or agent. */
export interface ProcessHandle {
  readonly id: string
  readonly name: string
  readonly status: () => 'starting' | 'running' | 'crashed' | 'restarting' | 'stopped'
  readonly stop: () => Promise<void>
}
