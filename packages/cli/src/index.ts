import { banner } from './banner.ts'
import { c, symbols } from './colors.ts'
import { cmdInit } from './commands/init.ts'
import { cmdRun } from './commands/run.ts'
import { cmdInspect } from './commands/inspect.ts'
import { cmdCompile } from './commands/compile.ts'
import { cmdBench } from './commands/bench.ts'
import { cmdEval } from './commands/eval.ts'
import { cmdDiff } from './commands/diff.ts'
import { cmdCache } from './commands/cache.ts'
import { cmdFork } from './commands/fork.ts'

const HELP = `${banner()}
${c.bold('USAGE')}
  ${c.cyan('grove')} ${c.dim('<command>')} ${c.dim('[args]')}

${c.bold('COMMANDS')}
  ${c.cyan('init')} ${c.dim('[file]')}       scaffold a new agent file (default: agent.ts)
  ${c.cyan('run')} ${c.dim('[--watch] <file>')}  execute an agent script (with optional hot reload)
  ${c.cyan('inspect')} ${c.dim('[id]')}      list sessions or print a session timeline
  ${c.cyan('compile')} ${c.dim('<file>')}    analyse a topology + emit a compile artifact
  ${c.cyan('bench')} ${c.dim('[--port=N]')}  launch the live web inspector (default :4773)
  ${c.cyan('eval')} ${c.dim('<file>')}       run an eval suite, save a behavioural profile
  ${c.cyan('diff')} ${c.dim('<suite>')}      diff two eval profiles (latest two by default)
  ${c.cyan('cache')} ${c.dim('[--stats|--clear|--prune=DAYS]')}  inspect or clean local state
  ${c.cyan('fork')} ${c.dim('[list|load <id>]')}    list saved forks or replay one

${c.bold('FLAGS')}
  ${c.cyan('-h, --help')}        show this help
  ${c.cyan('-v, --version')}     print version

${c.dim('learn more: https://grove.dev')}
`

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(HELP)
    return
  }

  if (cmd === '-v' || cmd === '--version') {
    console.log('grove 0.0.3')
    return
  }

  switch (cmd) {
    case 'init':
      return cmdInit(rest)
    case 'run':
      return cmdRun(rest)
    case 'inspect':
      return cmdInspect(rest)
    case 'compile':
      return cmdCompile(rest)
    case 'bench':
      return cmdBench(rest)
    case 'eval':
      return cmdEval(rest)
    case 'diff':
      return cmdDiff(rest)
    case 'cache':
      return cmdCache(rest)
    case 'fork':
      return cmdFork(rest)
    default:
      console.error(c.red(`${symbols.cross} unknown command: ${cmd}`))
      console.error(`run ${c.cyan('grove --help')} for usage`)
      process.exit(1)
  }
}
