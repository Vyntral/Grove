import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { c, symbols } from '../colors.ts'
import { getRecorder } from '@vyntral/grove-runtime'

interface ForkFile {
  forkedFrom: string
  throughIndex: number
  throughEvent?: { type: string; process: string; t: number }
  prefix: ReadonlyArray<{
    sessionId?: string
    t: number
    process: string
    type: string
    data: unknown
  }>
  createdAt: string
}

const FORKS_DIR = () => join(process.cwd(), '.grove', 'forks')

/**
 * `grove fork list` — show fork files saved by the Bench.
 * `grove fork load <id>` — replay a fork's prefix into a new recorder
 *                           session linked to the original by metadata,
 *                           ready to be scrubbed in the Bench.
 */
export async function cmdFork(args: string[]): Promise<void> {
  const sub = args[0]
  if (!sub || sub === 'list') return listForks()
  if (sub === 'load') return loadFork(args[1])
  console.error(c.red(`${symbols.cross} usage: grove fork [list|load <id>]`))
  process.exit(1)
}

function listForks(): void {
  const dir = FORKS_DIR()
  if (!existsSync(dir)) {
    console.log(c.dim('no forks yet — fork from the Bench timeline (press F)'))
    return
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.log(c.dim('no forks yet — fork from the Bench timeline (press F)'))
    return
  }
  console.log(c.bold('forks:'))
  for (const f of files.sort().reverse()) {
    const fork = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ForkFile
    const id = f.replace(/\.json$/, '')
    console.log(`  ${c.cyan(id)} ${c.dim(`from ${fork.forkedFrom} @ #${fork.throughIndex} · ${fork.prefix.length} events`)}`)
  }
  console.log()
  console.log(c.dim(`load: ${c.cyan('grove fork load <id>')}`))
}

function loadFork(id: string | undefined): void {
  if (!id) {
    console.error(c.red(`${symbols.cross} usage: grove fork load <id>`))
    process.exit(1)
  }
  const path = join(FORKS_DIR(), `${id}.json`)
  if (!existsSync(path)) {
    console.error(c.red(`${symbols.cross} fork not found: ${id}`))
    process.exit(1)
  }
  const fork = JSON.parse(readFileSync(path, 'utf8')) as ForkFile
  const rec = getRecorder()
  const newSessionId = rec.forkSession(fork.forkedFrom, fork.throughIndex)
  if (!newSessionId) {
    console.error(
      c.red(
        `${symbols.cross} parent session ${fork.forkedFrom} not in recorder — cannot replay`,
      ),
    )
    process.exit(1)
  }

  console.log(c.green(`${symbols.check} loaded fork ${c.bold(id)}`))
  console.log(c.dim(`  parent: ${fork.forkedFrom}`))
  console.log(c.dim(`  events copied: ${fork.prefix.length}`))
  console.log(c.dim(`  new session: ${c.cyan(newSessionId)}`))
  console.log(c.dim(`  inspect: ${c.cyan(`grove inspect ${newSessionId}`)}`))
}
