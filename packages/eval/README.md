# @grove/eval

> Declarative eval cases + behaviour-diff between profiles. Catch
> regressions in agent output before they ship.

```bash
bun add @grove/eval
```

```ts
import { suite, evalCase, contains, matches } from '@grove/eval'

export const suite = suite('word-counter', [
  evalCase({
    id: 'short',
    input: 'How many words: "hello world"?',
    assertions: [contains('2'), matches(/\bwords?\b/i)],
  }),
])
```

```bash
$ grove eval examples/eval-suite.ts
word-counter: 4 passed, 0 failed in 7569ms
✓ profile saved to .grove/eval/word-counter/abc1234.json

$ grove diff word-counter
  drift: 1
  regressed: 1
    regressed   short  — output does not contain "2"
```

`grove diff` exits non-zero on regression — drop into CI.

MIT.
