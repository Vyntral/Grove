import type {
  AgentCacheConfig,
  AgentDef,
  AnyTool,
  MemoryDef,
  ModelId,
} from './types.ts'

export interface AgentInput {
  readonly name: string
  readonly model: ModelId
  readonly system?: string
  readonly prompt?: string
  readonly tools?: ReadonlyArray<AnyTool>
  readonly memory?: MemoryDef
  readonly maxSteps?: number
  readonly temperature?: number
  readonly invariants?: ReadonlyArray<string>
  readonly cache?: boolean | AgentCacheConfig
  readonly timeout?: number
  readonly retries?: number
  readonly stream?: boolean
}

/**
 * Define a Grove agent — a supervised process with a model, tools, and optional memory.
 *
 * The returned definition is a plain object (no side effects). Pass it to
 * `supervise(...)` and start it via the runtime to spawn an actual process.
 *
 * @example
 *   const research = agent({
 *     name: 'research',
 *     model: 'anthropic/claude-opus-4-7',
 *     system: 'You research topics rigorously.',
 *     tools: [search, summarize],
 *     memory: memory.persistent('research-notes'),
 *   })
 */
export function agent(spec: AgentInput): AgentDef {
  return {
    _grove: 'agent',
    name: spec.name,
    model: spec.model,
    system: spec.system,
    prompt: spec.prompt,
    tools: spec.tools,
    memory: spec.memory,
    maxSteps: spec.maxSteps ?? 16,
    temperature: spec.temperature,
    invariants: spec.invariants,
    cache: spec.cache,
    timeout: spec.timeout,
    retries: spec.retries,
    stream: spec.stream,
  }
}

export function isAgent(value: unknown): value is AgentDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _grove?: unknown })._grove === 'agent'
  )
}
