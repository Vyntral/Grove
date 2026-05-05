import type { CaseDiff, CaseStatus, SuiteDiff, SuiteProfile } from './types.ts'

/**
 * Compare two suite profiles case-by-case.
 *
 * The classification rules:
 * - `same`      : output hash unchanged AND assertion verdict unchanged
 * - `drift`     : output hash changed but all assertions still pass on both
 * - `regressed` : was passing, now failing (any assertion broke)
 * - `improved`  : was failing, now passing
 * - `new`       : case present in head but not in base
 * - `removed`   : case present in base but not in head
 */
export function diffProfiles(base: SuiteProfile, head: SuiteProfile): SuiteDiff {
  const baseById = new Map(base.results.map((r) => [r.id, r]))
  const headById = new Map(head.results.map((r) => [r.id, r]))
  const ids = new Set([...baseById.keys(), ...headById.keys()])

  const cases: CaseDiff[] = []
  for (const id of ids) {
    const b = baseById.get(id)
    const h = headById.get(id)
    if (b && !h) {
      cases.push({ id, status: 'removed' })
      continue
    }
    if (!b && h) {
      cases.push({ id, status: 'new' })
      continue
    }
    if (!b || !h) continue

    if (b.passed && !h.passed) {
      cases.push({
        id,
        status: 'regressed',
        notes: h.assertionResults.find((a) => !a.passed)?.reason,
      })
    } else if (!b.passed && h.passed) {
      cases.push({ id, status: 'improved' })
    } else if (b.outputHash !== h.outputHash) {
      cases.push({ id, status: 'drift' })
    } else {
      cases.push({ id, status: 'same' })
    }
  }

  const summary: Record<CaseStatus, number> = {
    same: 0,
    drift: 0,
    regressed: 0,
    improved: 0,
    new: 0,
    removed: 0,
  }
  for (const c of cases) summary[c.status] += 1

  return {
    base: base.gitSha ?? base.recordedAt,
    head: head.gitSha ?? head.recordedAt,
    cases,
    summary,
  }
}
