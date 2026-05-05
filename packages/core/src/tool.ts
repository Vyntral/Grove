import type { SchemaLike, ToolDef } from './types.ts'

export interface ToolInput<I> {
  readonly name: string
  readonly description: string
  readonly schema?: SchemaLike<I>
  readonly deterministic?: boolean
  readonly examples?: ReadonlyArray<I>
  readonly run: (input: I) => Promise<unknown> | unknown
}

/**
 * Define a typed tool callable by an agent.
 *
 * Tools whose output is a pure function of input should be marked
 * `deterministic: true` — the compiler will cache and elide LLM round-trips.
 *
 * @example
 *   const search = tool({
 *     name: 'search',
 *     description: 'Search the web for a query.',
 *     schema: z.object({ query: z.string() }),
 *     run: async ({ query }) => fetchResults(query),
 *   })
 */
export function tool<I = unknown, O = unknown>(
  spec: ToolInput<I>,
): ToolDef<I, O> {
  return {
    _grove: 'tool',
    name: spec.name,
    description: spec.description,
    schema: spec.schema as ToolDef<I, O>['schema'],
    deterministic: spec.deterministic ?? false,
    examples: spec.examples as ToolDef<I, O>['examples'],
    run: spec.run as ToolDef<I, O>['run'],
  }
}

export function isTool(value: unknown): value is ToolDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _grove?: unknown })._grove === 'tool'
  )
}
