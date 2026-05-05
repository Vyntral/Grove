import { c, symbols } from '../colors.ts'

/**
 * `grove bench` — launch the live web inspector.
 *
 * Imports the Bench server lazily so the CLI works fine in environments
 * where the `@grove/bench` package isn't installed.
 */
export async function cmdBench(args: string[]): Promise<void> {
  const portArg = args.find((a) => a.startsWith('--port='))?.split('=')[1]
  const port = Number(portArg ?? process.env.GROVE_BENCH_PORT ?? 4773)

  let mod: typeof import('@grove/bench')
  try {
    mod = await import('@grove/bench')
  } catch {
    console.error(c.red(`${symbols.cross} @grove/bench is not installed`))
    console.error(c.dim(`  install with: bun add @grove/bench`))
    process.exit(1)
  }

  mod.startBench({ port })
  console.log(c.green(`${symbols.check} bench listening on ${c.cyan(`http://localhost:${port}`)}`))
  console.log(c.dim(`  ${symbols.arrow} open the URL in a browser`))
  console.log(c.dim(`  ${symbols.arrow} agents you start in another terminal will appear live`))

  // Keep process alive until SIGINT.
  await new Promise(() => {})
}
