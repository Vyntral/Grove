/**
 * Tiny ANSI helpers — no chalk dependency.
 * Auto-disabled when stdout is not a TTY.
 */
const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const wrap = (open: number, close: number) => (s: string | number) =>
  useColor ? `\x1b[${open}m${s}\x1b[${close}m` : `${s}`

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
}

export const symbols = {
  arrow: '→',
  check: '✓',
  cross: '✗',
  bullet: '•',
  tree: { branch: '├─', last: '└─', vert: '│' },
}
