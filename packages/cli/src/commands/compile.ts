import { resolve, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { c, symbols } from '../colors.ts'
import { analyse, emit, prewarm, type TopologyAnalysis } from '@vyntral/grove-compiler'
import { isAgent, isSupervisor } from '@vyntral/grove-core'
import { getCache } from '@vyntral/grove-runtime'

/**
 * `grove compile <file>` — analyse the agent topology exported by a script
 * and emit a compile artifact under `.grove/compiled/`.
 *
 * The script must export a `tree` (or `default`) value: either an `AgentDef`
 * or a `SupervisorDef`.
 */
export async function cmdCompile(args: string[]): Promise<void> {
  const file = args[0]
  if (!file) {
    console.error(c.red(`${symbols.cross} usage: grove compile <file>`))
    process.exit(1)
  }
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) {
    console.error(c.red(`${symbols.cross} no such file: ${file}`))
    process.exit(1)
  }

  const mod = await import(path)
  const tree = mod.tree ?? mod.default
  if (!tree || (!isAgent(tree) && !isSupervisor(tree))) {
    console.error(
      c.red(
        `${symbols.cross} ${file} must export \`tree\` (an agent or supervisor)`,
      ),
    )
    process.exit(1)
  }

  const analysis = analyse(tree)
  const name = basename(file).replace(/\.[jt]s$/, '')

  // Prewarm the runtime cache with declared tool examples so cold-start runs
  // hit the cache for known inputs.
  const prewarmReport = await prewarm(tree)
  if (prewarmReport.entries.length > 0) {
    getCache().prewarm(prewarmReport.entries)
  }

  const { dir } = emit(name, analysis, prewarmReport)

  printAnalysis(analysis, name, dir, prewarmReport.entries.length, prewarmReport.skipped.length)
}

function printAnalysis(
  a: TopologyAnalysis,
  name: string,
  dir: string,
  prewarmedEntries = 0,
  prewarmSkipped = 0,
): void {
  console.log()
  console.log(c.bold(`compiled ${c.cyan(name)}`))
  console.log()

  for (const ag of a.agents) {
    const det = (ag.determinismScore * 100).toFixed(0)
    const speedup = ag.speedupX.toFixed(1)
    console.log(`  ${c.bold(ag.name.padEnd(18))} ${c.dim(ag.model)}`)
    console.log(`    tools: ${ag.toolCount} (${c.green(`${ag.deterministicTools} deterministic`)})`)
    console.log(`    determinism: ${c.cyan(`${det}%`)}, speedup: ${c.cyan(`${speedup}×`)}`)
    console.log(
      `    cost/run: ${c.red(`$${ag.costPerRunUsd.toFixed(4)}`)} ${symbols.arrow} ${c.green(`$${ag.compiledCostPerRunUsd.toFixed(4)}`)}`,
    )
    console.log()
  }

  console.log(c.bold('total'))
  console.log(
    `  cost projection: ${c.red(`$${a.totalCostPerRunUsd.toFixed(4)}`)} ${symbols.arrow} ${c.green(`$${a.compiledCostPerRunUsd.toFixed(4)}`)} ${c.dim(`(${a.costReductionX.toFixed(1)}× cheaper)`)}`,
  )
  if (prewarmedEntries > 0) {
    console.log(
      `  ${c.green(`${symbols.check} prewarmed cache with ${prewarmedEntries} entries`)}${
        prewarmSkipped > 0 ? c.dim(` (${prewarmSkipped} skipped)`) : ''
      }`,
    )
  }
  console.log()
  console.log(c.dim(`${symbols.check} artifact written to ${c.cyan(dir)}`))
}
