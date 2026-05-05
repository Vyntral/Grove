import { c, symbols } from '../colors.ts'
import { listProfiles, loadProfile, diffProfiles } from '@grove/eval'

/**
 * `grove diff <suite> [base] [head]` — compare two eval profiles.
 *
 * If only `<suite>` is given, diffs the most recent two runs.
 * If only `<suite> <base>` is given, diffs base vs the latest.
 */
export async function cmdDiff(args: string[]): Promise<void> {
  const [suite, baseRef, headRef] = args
  if (!suite) {
    console.error(
      c.red(`${symbols.cross} usage: grove diff <suite> [base] [head]`),
    )
    process.exit(1)
  }

  const profiles = listProfiles(suite)
  if (profiles.length < 2 && !(baseRef && headRef)) {
    console.error(
      c.yellow(
        `${symbols.cross} need at least two profiles for ${c.bold(suite)} — found ${profiles.length}`,
      ),
    )
    process.exit(1)
  }

  const headRefResolved = headRef ?? profiles[0]!.ref
  const baseRefResolved = baseRef ?? profiles[1]!.ref

  const base = loadProfile(suite, baseRefResolved)
  const head = loadProfile(suite, headRefResolved)
  if (!base || !head) {
    console.error(
      c.red(
        `${symbols.cross} could not load profiles ` +
          `(base=${baseRefResolved}, head=${headRefResolved})`,
      ),
    )
    process.exit(1)
  }

  const d = diffProfiles(base, head)
  console.log(
    c.dim(`${symbols.arrow} ${c.bold(suite)}  `) +
      c.dim(baseRefResolved) +
      c.dim(' → ') +
      c.dim(headRefResolved),
  )
  console.log()

  const labels: Record<string, (s: string) => string> = {
    same: c.dim,
    drift: c.yellow,
    regressed: c.red,
    improved: c.green,
    new: c.cyan,
    removed: c.gray,
  }
  for (const [k, n] of Object.entries(d.summary)) {
    if (n > 0) console.log(`  ${labels[k]?.(k) ?? k}: ${c.bold(n.toString())}`)
  }
  console.log()

  for (const item of d.cases) {
    if (item.status === 'same') continue
    const tag = (labels[item.status] ?? c.dim)(item.status.padEnd(10))
    console.log(`  ${tag} ${c.bold(item.id)}${item.notes ? c.dim(`  — ${item.notes.slice(0, 80)}`) : ''}`)
  }

  if (d.summary.regressed > 0) process.exit(2) // CI-friendly: non-zero exit on regression
}
