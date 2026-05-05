import type {
  ChildDef,
  RestartPolicy,
  RestartStrategy,
  SupervisorDef,
} from './types.ts'

export interface SupervisorInput {
  readonly name?: string
  readonly strategy?: RestartStrategy
  readonly children: ReadonlyArray<ChildDef>
  readonly restart?: Partial<RestartPolicy>
}

const DEFAULT_RESTART: RestartPolicy = { intensity: 5, period: 60_000 }

/**
 * Build a supervisor tree node — Erlang/OTP semantics.
 *
 * Strategies:
 * - `one_for_one`  : restart only the failed child (default)
 * - `one_for_all`  : restart every child on any failure
 * - `rest_for_one` : restart the failed child + everything started after it
 *
 * Restart policy: if `intensity` restarts happen within `period` ms, the
 * supervisor itself dies and bubbles up to its parent. This is the OTP
 * "max restarts" guard against crash-loops.
 *
 * @example
 *   const tree = supervise({
 *     strategy: 'rest_for_one',
 *     children: [research, writer],
 *     restart: { intensity: 5, period: 60_000 },
 *   })
 */
export function supervise(spec: SupervisorInput): SupervisorDef {
  return {
    _grove: 'supervisor',
    name: spec.name ?? `supervisor-${spec.children.length}`,
    strategy: spec.strategy ?? 'one_for_one',
    children: spec.children,
    restart: { ...DEFAULT_RESTART, ...spec.restart },
  }
}

export function isSupervisor(value: unknown): value is SupervisorDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _grove?: unknown })._grove === 'supervisor'
  )
}
