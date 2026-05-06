import type {
  AgentDef,
  AnyTool,
  ChildDef,
  SupervisorDef,
} from '@vyntral/grove-core'
import { isSupervisor } from '@vyntral/grove-core'
import { projectCost } from './cost.ts'

export interface AgentAnalysis {
  readonly name: string
  readonly model: string
  readonly toolCount: number
  readonly deterministicTools: number
  readonly determinismScore: number // 0..1 — fraction of declared tools that are pure
  readonly cacheableStepBudget: number
  readonly costPerRunUsd: number
  readonly compiledCostPerRunUsd: number
  readonly speedupX: number
}

export interface TopologyAnalysis {
  readonly agents: ReadonlyArray<AgentAnalysis>
  readonly totalCostPerRunUsd: number
  readonly compiledCostPerRunUsd: number
  readonly costReductionX: number
}

/* ─── tool determinism heuristics ──────────────────────────────────── */

const PURE_TOOL_HINTS = [
  'parse',
  'format',
  'transform',
  'sum',
  'count',
  'hash',
  'extract',
  'lookup',
  'cache',
  'render',
]

/**
 * A tool is treated as "deterministic for caching purposes" if:
 * 1. It explicitly opts in via `tool({ deterministic: true })`, or
 * 2. Its name strongly suggests a pure transform.
 *
 * The heuristic is intentionally conservative — false negatives (failing to
 * cache a cacheable tool) are safe; false positives (caching a side-effecting
 * tool) would corrupt behaviour. Devs can always set `deterministic: true`
 * explicitly.
 */
export function isDeterministicTool(t: AnyTool): boolean {
  if (t.deterministic) return true
  const lower = t.name.toLowerCase()
  return PURE_TOOL_HINTS.some((hint) => lower.includes(hint))
}

/* ─── per-agent analysis ───────────────────────────────────────────── */

const ASSUMED_PROMPT_TOKENS = 4_000
const ASSUMED_COMPLETION_TOKENS = 800

function analyseAgent(a: AgentDef): AgentAnalysis {
  const tools = a.tools ?? []
  const det = tools.filter(isDeterministicTool).length
  const determinismScore = tools.length === 0 ? 0 : det / tools.length

  const baseCost = projectCost(
    a.model,
    ASSUMED_PROMPT_TOKENS,
    ASSUMED_COMPLETION_TOKENS,
  )

  // Compile assumption: a fraction of model calls equal to the determinism
  // score can be elided after the first run via cache + structural
  // memoisation. We additionally apply a floor (cold-cache) of 5% — even a
  // perfectly deterministic agent still warms its cache once.
  const elidedFraction = Math.min(0.95, determinismScore)
  const compiledCost = baseCost * (1 - elidedFraction) + baseCost * 0.05

  return {
    name: a.name,
    model: a.model,
    toolCount: tools.length,
    deterministicTools: det,
    determinismScore,
    cacheableStepBudget: Math.floor((a.maxSteps ?? 16) * elidedFraction),
    costPerRunUsd: baseCost,
    compiledCostPerRunUsd: compiledCost,
    speedupX: compiledCost > 0 ? baseCost / compiledCost : 1,
  }
}

/* ─── topology walker ──────────────────────────────────────────────── */

function* walkAgents(node: ChildDef): Generator<AgentDef> {
  if (isSupervisor(node)) {
    for (const c of (node as SupervisorDef).children) yield* walkAgents(c)
    return
  }
  yield node as AgentDef
}

export function analyse(tree: ChildDef): TopologyAnalysis {
  const agents = [...walkAgents(tree)].map(analyseAgent)
  const total = agents.reduce((s, a) => s + a.costPerRunUsd, 0)
  const compiled = agents.reduce((s, a) => s + a.compiledCostPerRunUsd, 0)
  return {
    agents,
    totalCostPerRunUsd: total,
    compiledCostPerRunUsd: compiled,
    costReductionX: compiled > 0 ? total / compiled : 1,
  }
}
