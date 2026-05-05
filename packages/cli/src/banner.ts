import { c } from './colors.ts'

export function banner(): string {
  return [
    '',
    c.green('  ╔═════════════════════════════════════════╗'),
    c.green('  ║  ') + c.bold('GROVE') + c.green('   production-grade agents       ║'),
    c.green('  ╚═════════════════════════════════════════╝'),
    c.dim('  supervise · compile · time-travel'),
    '',
  ].join('\n')
}
