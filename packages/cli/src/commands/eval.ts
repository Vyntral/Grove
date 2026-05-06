import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { c, symbols } from '../colors.ts'
import { isAgent, isSupervisor } from '@vyntral/grove-core'
import { start } from '@vyntral/grove-runtime'
import {
  isSuite,
  runSuite,
  saveProfile,
  loadProfile,
  listProfiles,
  diffProfiles,
} from '@vyntral/grove-eval'

/**
 * `grove eval <file>` — load an eval suite from `<file>` and run every case
 * against the agent topology exported from the same file (or its `tree`).
 *
 * The eval file should export:
 *   - `tree`   : a SupervisorDef or AgentDef
 *   - `suite`  : an EvalSuite produced by `suite(name, [evalCase(...), ...])`
 */
export async function cmdEval(args: string[]): Promise<void> {
  const file = args[0]
  if (!file) {
    console.error(c.red(`${symbols.cross} usage: grove eval <file>`))
    process.exit(1)
  }
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) {
    console.error(c.red(`${symbols.cross} no such file: ${file}`))
    process.exit(1)
  }

  const mod = await import(path)
  const tree = mod.tree ?? mod.default
  const suite = mod.suite
  if (!tree || (!isAgent(tree) && !isSupervisor(tree))) {
    console.error(c.red(`${symbols.cross} ${file} must export \`tree\``))
    process.exit(1)
  }
  if (!isSuite(suite)) {
    console.error(c.red(`${symbols.cross} ${file} must export \`suite\``))
    process.exit(1)
  }

  console.log(c.dim(`${symbols.arrow} running ${c.cyan(suite.cases.length.toString())} cases against ${c.bold(suite.name)}`))

  const { handle } = await start(tree)
  const t0 = performance.now()
  const profile = await runSuite(suite, handle)
  const t1 = performance.now()
  await handle.stop()

  const path2 = saveProfile(profile)

  const passed = profile.results.filter((r) => r.passed).length
  const failed = profile.results.length - passed
  console.log()
  console.log(
    c.bold(`${suite.name}:`) +
      ` ${c.green(`${passed} passed`)}, ${failed > 0 ? c.red(`${failed} failed`) : c.dim('0 failed')} in ${(t1 - t0).toFixed(0)}ms`,
  )
  for (const r of profile.results) {
    const tag = r.passed ? c.green(symbols.check) : c.red(symbols.cross)
    console.log(`  ${tag} ${c.bold(r.id.padEnd(20))} ${c.dim(`${r.latencyMs.toFixed(0)}ms`)}`)
    if (!r.passed) {
      for (const a of r.assertionResults.filter((a) => !a.passed)) {
        console.log(c.red(`      └─ ${a.name}: ${a.reason ?? ''}`))
      }
    }
  }
  console.log()
  console.log(c.dim(`${symbols.check} profile saved to ${c.cyan(path2)}`))

  // Compare against the previous profile, if any.
  const profiles = listProfiles(suite.name)
  const prev = profiles.find((p) => p.recordedAt !== profile.recordedAt)
  if (prev) {
    const base = loadProfile(suite.name, prev.ref)
    if (base) {
      const d = diffProfiles(base, profile)
      console.log()
      console.log(c.bold('diff vs previous run:'))
      const labels: Record<string, string> = {
        same: c.dim('same'),
        drift: c.yellow('drift'),
        regressed: c.red('regressed'),
        improved: c.green('improved'),
        new: c.cyan('new'),
        removed: c.gray('removed'),
      }
      for (const [k, v] of Object.entries(d.summary)) {
        if (v > 0) console.log(`  ${labels[k]}: ${v}`)
      }
      const interesting = d.cases.filter((c2) => c2.status !== 'same')
      for (const it of interesting) {
        console.log(`    ${labels[it.status]}  ${it.id}${it.notes ? c.dim(` — ${it.notes.slice(0, 80)}`) : ''}`)
      }
    }
  }
}
