import type { Assertion, EvalCase, EvalSuite } from './types.ts'

/* ─── case factory ─────────────────────────────────────────────────── */

interface CaseInput {
  readonly id: string
  readonly input: unknown
  readonly assertions?: ReadonlyArray<Assertion | AssertionShorthand>
  readonly tags?: ReadonlyArray<string>
}

type AssertionShorthand =
  | { readonly contains: string }
  | { readonly matches: RegExp }
  | { readonly equals: unknown }
  | ((output: unknown) => true | string)

function normaliseAssertion(a: Assertion | AssertionShorthand): Assertion {
  if (typeof a === 'function') {
    return {
      name: a.name || 'predicate',
      check: a as Assertion['check'],
    }
  }
  if ('check' in a && typeof a.check === 'function') return a
  if ('contains' in a) return contains(a.contains)
  if ('matches' in a) return matches(a.matches)
  if ('equals' in a) return equals(a.equals)
  throw new Error('[grove/eval] unknown assertion shape')
}

export function evalCase(spec: CaseInput): EvalCase {
  return {
    _grove: 'eval-case',
    id: spec.id,
    input: spec.input,
    assertions: (spec.assertions ?? []).map(normaliseAssertion),
    tags: spec.tags,
  }
}

/* ─── suite factory ────────────────────────────────────────────────── */

export function suite(name: string, cases: ReadonlyArray<EvalCase>): EvalSuite {
  return { _grove: 'eval-suite', name, cases }
}

export function isCase(value: unknown): value is EvalCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _grove?: unknown })._grove === 'eval-case'
  )
}

export function isSuite(value: unknown): value is EvalSuite {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _grove?: unknown })._grove === 'eval-suite'
  )
}

/* ─── built-in assertion helpers ───────────────────────────────────── */

export function contains(needle: string): Assertion {
  return {
    name: `contains "${needle}"`,
    check: (output) => {
      const s = typeof output === 'string' ? output : JSON.stringify(output)
      return s.includes(needle) ? true : `output does not contain "${needle}"`
    },
  }
}

export function matches(pattern: RegExp): Assertion {
  return {
    name: `matches /${pattern.source}/${pattern.flags}`,
    check: (output) => {
      const s = typeof output === 'string' ? output : JSON.stringify(output)
      return pattern.test(s) ? true : `output does not match ${pattern}`
    },
  }
}

export function equals(expected: unknown): Assertion {
  const expectedJson = JSON.stringify(expected)
  return {
    name: `equals ${expectedJson.slice(0, 40)}`,
    check: (output) => {
      const got = JSON.stringify(output)
      return got === expectedJson ? true : `expected ${expectedJson}, got ${got.slice(0, 80)}`
    },
  }
}

export function notMatches(pattern: RegExp): Assertion {
  return {
    name: `does not match /${pattern.source}/${pattern.flags}`,
    check: (output) => {
      const s = typeof output === 'string' ? output : JSON.stringify(output)
      return !pattern.test(s) ? true : `output matches ${pattern} (forbidden)`
    },
  }
}
