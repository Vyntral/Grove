# @vyntral/grove-runtime

> The Grove runtime: supervised agent processes, time-travel recorder,
> deterministic-tool cache, hot-reloadable workers, graceful shutdown.

```bash
bun add @vyntral/grove-runtime
```

```ts
import { start, AISDKBackend } from '@vyntral/grove-runtime'
import { tree } from './agent.ts'

const { handle, sessionId } = await start(tree, { backend: new AISDKBackend() })
const out = await handle.run('hello')
console.log(out)
await handle.stop()
```

What this package owns:

- **Supervisor process model** — OTP-style `one_for_one` / `one_for_all`
  / `rest_for_one` strategies, restart-intensity guard, hot reload.
- **Recorder** — every event lands in `.grove/recordings.db` (SQLite).
  Read it with `getRecorder()`; visualise it with `@vyntral/grove-bench`.
- **Deterministic tool cache** — content-hashed by `(tool, input)`,
  persistent across processes, LRU eviction beyond `maxEntries`.
- **Memory primitive** — `memory.{ephemeral,session,persistent}(key)`
  surfaces three implicit tools (`memory_get`/`memory_set`/`memory_list`)
  to the agent.
- **AISDKBackend** — Vercel AI SDK v6 with retry, timeout, prompt caching.
- **Graceful shutdown** — SIGINT/SIGTERM run a registered cleanup chain.
- **Streaming** — opt in via `agent({ stream: true })`; tokens emit
  `text_chunk` events to the recorder as they arrive.

Site: https://vyntral.github.io/Grove · Source: https://github.com/Vyntral/Grove

MIT.
