/* ─── eval case definition ─────────────────────────────────────────── */

export interface EvalCase {
  readonly _grove: 'eval-case'
  readonly id: string
  readonly input: unknown
  readonly assertions: ReadonlyArray<Assertion>
  readonly tags?: ReadonlyArray<string>
}

/**
 * An assertion is just a function that returns `true` (passed) or any
 * other value (failed, with that value used as the failure reason).
 *
 * Helpers `contains()`, `matches()`, `equals()` produce typed Assertion
 * objects you can compose. Plain functions also work — Grove only inspects
 * the `name` and `check` fields.
 */
export interface Assertion {
  readonly name: string
  readonly check: (output: unknown) => true | string
}

/* ─── suite ────────────────────────────────────────────────────────── */

export interface EvalSuite {
  readonly _grove: 'eval-suite'
  readonly name: string
  readonly cases: ReadonlyArray<EvalCase>
}

/* ─── results ──────────────────────────────────────────────────────── */

export interface CaseResult {
  readonly id: string
  /** Stable hash of the normalised output — drives the same/different decision in `diff`. */
  readonly outputHash: string
  /** First 500 chars of the stringified output, kept for human inspection. */
  readonly outputPreview: string
  readonly latencyMs: number
  readonly assertionResults: ReadonlyArray<{
    readonly name: string
    readonly passed: boolean
    readonly reason?: string
  }>
  readonly passed: boolean
}

export interface SuiteProfile {
  readonly suite: string
  readonly recordedAt: string
  readonly gitSha?: string | null
  readonly results: ReadonlyArray<CaseResult>
}

/* ─── diff ─────────────────────────────────────────────────────────── */

export type CaseStatus = 'same' | 'drift' | 'regressed' | 'improved' | 'new' | 'removed'

export interface CaseDiff {
  readonly id: string
  readonly status: CaseStatus
  readonly notes?: string
}

export interface SuiteDiff {
  readonly base: string
  readonly head: string
  readonly cases: ReadonlyArray<CaseDiff>
  readonly summary: Record<CaseStatus, number>
}
