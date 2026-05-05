import { createHash } from 'node:crypto'
import type { AgentDef, AnyTool, ChildDef, SupervisorDef } from '@grove/core'
import { isSupervisor } from '@grove/core'

export interface PrewarmEntry {
  readonly tool: string
  readonly input: unknown
  readonly output: unknown
  readonly inputHash: string
}

export interface PrewarmReport {
  readonly entries: ReadonlyArray<PrewarmEntry>
  readonly skipped: ReadonlyArray<{ tool: string; reason: string }>
}

/**
 * Walk the topology, collect every deterministic tool that declares
 * `examples`, run those examples once, and produce a list of
 * `(tool, input, output)` triples ready to be persisted into the runtime
 * cache by the compiler's emit step.
 *
 * Errors during prewarm are recorded as `skipped`, never thrown — a broken
 * example shouldn't break the build. The runtime will simply re-execute
 * the example the next time it's requested.
 */
export async function prewarm(tree: ChildDef): Promise<PrewarmReport> {
  const entries: PrewarmEntry[] = []
  const skipped: { tool: string; reason: string }[] = []
  const seen = new Set<string>()

  for (const tool of walkTools(tree)) {
    if (!tool.deterministic) continue
    if (!tool.examples || tool.examples.length === 0) continue
    for (const input of tool.examples) {
      const inputHash = hashInput(tool.name, input)
      if (seen.has(inputHash)) continue
      seen.add(inputHash)
      try {
        const output = await tool.run(input as never)
        entries.push({ tool: tool.name, input, output, inputHash })
      } catch (err) {
        skipped.push({
          tool: tool.name,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  return { entries, skipped }
}

function* walkTools(node: ChildDef): Generator<AnyTool> {
  if (isSupervisor(node)) {
    for (const c of (node as SupervisorDef).children) yield* walkTools(c)
    return
  }
  for (const t of (node as AgentDef).tools ?? []) yield t
}

function hashInput(toolName: string, input: unknown): string {
  return createHash('sha256').update(`${toolName}:${canon(input)}`).digest('hex').slice(0, 16)
}

function canon(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  )
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(',')}}`
}
