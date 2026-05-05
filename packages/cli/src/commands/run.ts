import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { c, symbols } from '../colors.ts'
import {
  getRecorder,
  start,
  watchTree,
  type ReloadController,
} from '@grove/runtime'
import { isAgent, isSupervisor, type SupervisorDef } from '@grove/core'

interface RunFlags {
  readonly watch: boolean
  readonly file: string | undefined
}

function parseFlags(args: string[]): RunFlags {
  let watch = false
  let file: string | undefined
  for (const a of args) {
    if (a === '--watch' || a === '-w') watch = true
    else if (!file) file = a
  }
  return { watch, file }
}

/**
 * `grove run [--watch] <file>` — execute an agent script and print a session summary.
 *
 * Non-watch mode just imports the file (its top-level `if (import.meta.main)`
 * block does the work). Watch mode extracts the exported `tree`, starts it
 * under the supervisor, and reloads affected children when the file changes.
 */
export async function cmdRun(args: string[]): Promise<void> {
  const flags = parseFlags(args)
  if (!flags.file) {
    console.error(c.red(`${symbols.cross} usage: grove run [--watch] <file>`))
    process.exit(1)
  }
  const path = resolve(process.cwd(), flags.file)
  if (!existsSync(path)) {
    console.error(c.red(`${symbols.cross} no such file: ${flags.file}`))
    process.exit(1)
  }

  if (flags.watch) {
    return runWatched(path, flags.file)
  }
  return runOnce(path, flags.file)
}

async function runOnce(path: string, label: string) {
  console.log(c.dim(`${symbols.arrow} running ${c.cyan(label)}`))
  const t0 = performance.now()
  await import(path)
  const t1 = performance.now()

  const rec = getRecorder()
  const last = rec.listSessions()[0]

  console.log()
  console.log(c.green(`${symbols.check} done in ${(t1 - t0).toFixed(0)}ms`))
  if (last) {
    console.log(c.dim(`  session: ${c.bold(last.id)}`))
    console.log(c.dim(`  inspect: ${c.cyan(`grove inspect ${last.id}`)}`))
  }
}

async function runWatched(path: string, label: string) {
  const mod = await import(path)
  const tree = mod.tree ?? mod.default
  if (!tree || (!isAgent(tree) && !isSupervisor(tree))) {
    console.error(
      c.red(`${symbols.cross} ${label} must export \`tree\` for --watch mode`),
    )
    process.exit(1)
  }

  const supervisorTree = isSupervisor(tree)
    ? (tree as SupervisorDef)
    : ({
        _grove: 'supervisor' as const,
        name: 'watch-root',
        strategy: 'one_for_one' as const,
        children: [tree],
        restart: { intensity: 5, period: 60_000 },
      } satisfies SupervisorDef)

  const { handle, sessionId } = await start(supervisorTree)
  console.log(c.green(`${symbols.check} started ${c.cyan(label)}`))
  console.log(c.dim(`  session: ${c.bold(sessionId)}`))
  console.log(c.dim(`  watching for changes — Ctrl+C to stop`))
  console.log()

  let reload: ReloadController | undefined
  if ('replace' in handle) {
    reload = watchTree(
      path,
      supervisorTree,
      async (def) => {
        await (handle as unknown as { replace(n: string, d: typeof def): Promise<void> })
          .replace(def.name, def)
      },
      {
        onReload: (changed) => {
          const list = changed.map((n) => c.bold(n)).join(', ')
          console.log(c.yellow(`${symbols.arrow} hot-reloaded: ${list}`))
        },
      },
    )
  }

  // Wait until the user kills us.
  await new Promise<void>((resolveProm) => {
    process.on('SIGINT', async () => {
      reload?.stop()
      await handle.stop()
      console.log(c.dim(`\n${symbols.check} stopped`))
      resolveProm()
    })
  })
}
