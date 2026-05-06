import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { isAgent, isSupervisor, type AgentDef, type SupervisorDef } from '@vyntral/grove-core'
import { getRecorder } from './recorder.ts'

export interface WatchOptions {
  /** Debounce window in ms — collapses rapid file-save bursts. */
  readonly debounceMs?: number
  /** Optional callback for log/UX surfaces. */
  readonly onReload?: (changedAgents: ReadonlyArray<string>) => void
}

export interface ReloadController {
  stop(): void
}

/**
 * Watch an agent script file and hot-reload affected children when it changes.
 *
 * Reload algorithm:
 * 1. Re-import the script with a busting query string (Bun honours it).
 * 2. Read the exported `tree`.
 * 3. Diff agent definitions by name against the live supervisor.
 * 4. For each agent whose serialised def changed: emit a `hot_reload` event
 *    and replace the slot's def + restart the process.
 *
 * Children with unchanged definitions keep running untouched — that is the
 * core ergonomic win over a full restart.
 */
export function watchTree(
  filePath: string,
  supervisor: SupervisorDef,
  apply: (def: AgentDef) => void,
  opts: WatchOptions = {},
): ReloadController {
  const abs = resolve(filePath)
  const debounce = opts.debounceMs ?? 100
  let timer: ReturnType<typeof setTimeout> | null = null
  const rec = getRecorder()
  const baseline = snapshotAgents(supervisor)

  const w = watch(abs, async () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      try {
        // Cache-bust import.
        const fresh = await import(`${abs}?t=${Date.now()}`)
        const newTree = (fresh.tree ?? fresh.default) as
          | AgentDef
          | SupervisorDef
          | undefined
        if (!newTree || (!isAgent(newTree) && !isSupervisor(newTree))) {
          return
        }
        const next = snapshotAgents(
          isSupervisor(newTree) ? newTree : ({ ...supervisor, children: [newTree] } as SupervisorDef),
        )
        const changed: string[] = []
        for (const [name, def] of next) {
          const prev = baseline.get(name)
          if (!prev || hash(prev) !== hash(def)) {
            changed.push(name)
            baseline.set(name, def)
            apply(def)
            rec.emit({
              process: name,
              type: 'hot_reload',
              data: { reason: 'file_changed' },
            })
          }
        }
        if (changed.length > 0) opts.onReload?.(changed)
      } catch (err) {
        rec.emit({
          process: '<watcher>',
          type: 'crash',
          data: {
            phase: 'reload',
            error: err instanceof Error ? err.message : String(err),
          },
        })
      }
    }, debounce)
  })

  return {
    stop: () => {
      if (timer) clearTimeout(timer)
      w.close()
    },
  }
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function snapshotAgents(node: SupervisorDef): Map<string, AgentDef> {
  const out = new Map<string, AgentDef>()
  walk(node, out)
  return out
}

function walk(
  node: AgentDef | SupervisorDef,
  out: Map<string, AgentDef>,
): void {
  if (isSupervisor(node)) {
    for (const c of node.children) walk(c, out)
    return
  }
  out.set(node.name, node)
}

function hash(def: AgentDef): string {
  // Stable hash of the load-bearing fields. Tools include only their names
  // (so a code change inside a tool body still triggers reload because the
  // *importing* path mutates the agent's structure on next snapshot).
  return JSON.stringify({
    name: def.name,
    model: def.model,
    system: def.system,
    prompt: def.prompt,
    temperature: def.temperature,
    maxSteps: def.maxSteps,
    tools: (def.tools ?? []).map((t) => t.name),
    memory: def.memory ? { kind: def.memory.kind, key: def.memory.key } : null,
  })
}
