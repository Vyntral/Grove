import { c, symbols } from '../colors.ts'
import { getCache, getRecorder } from '@grove/runtime'

/**
 * `grove cache [--stats|--clear|--prune=DAYS]` — manage Grove's local state.
 *
 * Two pieces of state live under `.grove/`:
 *   1. `recordings.db` — every event Grove ever saw (the time-travel log)
 *   2. `cache.db`      — deterministic-tool cache (with cross-process keys)
 *
 * This command exposes both as a single surface.
 */
export async function cmdCache(args: string[]): Promise<void> {
  if (args.length === 0 || args.includes('--stats')) {
    return printStats()
  }
  if (args.includes('--clear')) {
    return clear()
  }
  const pruneArg = args.find((a) => a.startsWith('--prune'))
  if (pruneArg) {
    const days = Number(pruneArg.split('=')[1] ?? '7')
    return prune(days)
  }
  console.error(
    c.red(`${symbols.cross} usage: grove cache [--stats|--clear|--prune=DAYS]`),
  )
  process.exit(1)
}

function printStats(): void {
  const rec = getRecorder()
  const cache = getCache()
  const r = rec.stats()
  const ch = cache.stats()
  const sizeKb = (r.sizeBytes / 1024).toFixed(1)

  console.log(c.bold('grove cache status'))
  console.log()
  console.log(c.dim('recordings (.grove/recordings.db)'))
  console.log(`  ${c.cyan('sessions')}: ${r.sessions}`)
  console.log(`  ${c.cyan('events')}:   ${r.events}`)
  console.log(`  ${c.cyan('size')}:     ${sizeKb} KB`)
  if (r.oldestAt) {
    console.log(
      `  ${c.cyan('oldest')}:   ${new Date(r.oldestAt).toISOString().slice(0, 19)}Z`,
    )
  }
  console.log()
  console.log(c.dim('deterministic cache (.grove/cache.db)'))
  console.log(`  ${c.cyan('entries')}:      ${ch.entries}`)
  console.log(`  ${c.cyan('session hits')}: ${ch.hits}`)
  console.log(`  ${c.cyan('saved (USD)')}:  ${ch.savedUsd.toFixed(4)}`)
}

function clear(): void {
  const rec = getRecorder()
  const cache = getCache()
  rec.clear()
  cache.reset()
  console.log(c.green(`${symbols.check} cleared recordings + cache`))
}

function prune(days: number): void {
  const rec = getRecorder()
  const removed = rec.purge(days * 24 * 60 * 60_000)
  console.log(c.green(`${symbols.check} pruned ${removed} sessions older than ${days}d`))
}
