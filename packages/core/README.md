# @vyntral/grove-core

> Grove primitives: `agent`, `tool`, `memory`, `supervise`.

The bottom of the Grove stack. Plain factory functions over plain types — no
side effects, no IO. Build your topology here, hand it to
`@vyntral/grove-runtime` to actually run.

```bash
bun add @vyntral/grove-core
```

```ts
import { agent, supervise, tool, memory } from '@vyntral/grove-core'
import { z } from 'zod'

const search = tool({
  name: 'search',
  description: 'Search the web for a query.',
  schema: z.object({ query: z.string() }),
  deterministic: true,
  run: async ({ query }) => fetchResults(query),
})

const research = agent({
  name: 'research',
  model: 'anthropic/claude-opus-4-7',
  system: 'You research topics rigorously.',
  tools: [search],
  memory: memory.persistent('notes'),
})

export const tree = supervise({
  strategy: 'one_for_one',
  children: [research],
  restart: { intensity: 5, period: 60_000 },
})
```

Site: https://vyntral.github.io/Grove · Source: https://github.com/Vyntral/Grove

MIT.
