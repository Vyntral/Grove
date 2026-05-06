# @vyntral/grove-bench

> Live web inspector for `@vyntral/grove-runtime`. Topology view, timeline scrubber,
> step detail, fork-from-step, summary panel. Reads from the same
> `.grove/recordings.db` Grove writes during normal operation.

```bash
bun add @vyntral/grove-bench
grove bench    # http://localhost:4773
```

Or programmatically:

```ts
import { startBench } from '@vyntral/grove-bench'
startBench({ port: 4773 })
```

Keyboard shortcuts: `←/→` step, `Home/End` jump, `F` fork from selected step.

MIT.
