import { c, symbols } from '../colors.ts'
import { getRecorder } from '@grove/runtime'

/** Pretty-print a session timeline to the terminal. */
export async function cmdInspect(args: string[]): Promise<void> {
  const rec = getRecorder()
  const id = args[0]

  if (!id) {
    const sessions = rec.listSessions().slice(0, 20)
    if (sessions.length === 0) {
      console.log(c.dim('no recorded sessions yet — try `grove run <file>` first'))
      return
    }
    console.log(c.bold('recent sessions:'))
    for (const s of sessions) {
      const dur = s.endedAt ? `${s.endedAt - s.startedAt}ms` : c.yellow('running')
      console.log(`  ${c.cyan(s.id)} ${c.dim(`(${dur})`)}`)
    }
    console.log()
    console.log(c.dim(`${symbols.arrow} inspect a session: ${c.cyan('grove inspect <id>')}`))
    return
  }

  const session = rec.getSession(id)
  if (!session) {
    console.error(c.red(`${symbols.cross} session ${id} not found`))
    process.exit(1)
  }

  console.log(c.bold(`session ${session.id}`))
  console.log(c.dim(`  started: ${new Date(session.startedAt).toISOString()}`))
  console.log(c.dim(`  events:  ${session.events.length}`))
  console.log()

  for (const ev of session.events) {
    const tag =
      ev.type === 'crash' ? c.red(ev.type)
      : ev.type === 'restart' ? c.yellow(ev.type)
      : ev.type === 'spawn' ? c.green(ev.type)
      : ev.type === 'tool_call' ? c.magenta(ev.type)
      : ev.type === 'tool_result' ? c.cyan(ev.type)
      : ev.type === 'model_call' ? c.blue(ev.type)
      : c.dim(ev.type)
    const dt = ev.t - session.startedAt
    const data = ev.data ? c.dim(JSON.stringify(ev.data).slice(0, 80)) : ''
    console.log(`  ${c.dim(`${dt.toString().padStart(5)}ms`)}  ${tag.padEnd(20)} ${c.bold(ev.process.padEnd(14))} ${data}`)
  }
}
