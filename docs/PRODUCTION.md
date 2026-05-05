# Production deployment

Grove is small enough that there's no "platform" to set up. You ship
your TypeScript, Bun runs it, the supervisor + recorder + cache live
under `.grove/` next to your code. This guide covers the things you
actually have to think about when going from `bun run agent.ts` to a
service handling real traffic.

## Required environment

```bash
# One of these must be set for AISDKBackend.
AI_GATEWAY_API_KEY=...           # preferred — Vercel AI Gateway, any provider
VERCEL_OIDC_TOKEN=...            # auto-set on Vercel deployments
ANTHROPIC_API_KEY=... + GROVE_DIRECT_PROVIDER=1   # direct, Anthropic only

# Optional — defaults shown
GROVE_BACKEND=ai-sdk             # mock | ai-sdk
GROVE_CACHE_MAX_ENTRIES=10000    # LRU cap on the deterministic-tool cache
GROVE_BENCH_PORT=4773            # if you run grove bench in the same container
```

## Filesystem layout

Grove writes three SQLite files under `.grove/` in the process CWD:

| Path | Purpose | Survives container restart? |
| ---- | ------- | --------------------------- |
| `.grove/recordings.db` | every event the supervisor sees | yes (mount as volume) |
| `.grove/cache.db` | deterministic-tool outputs, content-hashed | yes (mount as volume) |
| `.grove/memory.db` | persistent agent memory (`memory.persistent(...)`) | yes (mount as volume) |
| `.grove/forks/`, `.grove/eval/`, `.grove/compiled/` | inspector forks, eval profiles, compile artifacts | yes |

In Kubernetes, mount one PVC at `/app/.grove` and the supervisor + cache
+ memory all share durability. Don't put it on a tmpfs unless you
genuinely don't care about cache warm-state across restarts.

## Retention

`.grove/recordings.db` grows. Trim it on a schedule:

```bash
# Drop sessions older than 7 days, vacuum afterwards.
grove cache --prune=7

# Show current size + counts.
grove cache --stats

# Wipe everything (destructive).
grove cache --clear
```

Or programmatically:

```ts
import { getRecorder } from '@grove/runtime'
getRecorder().purge(7 * 24 * 60 * 60 * 1000) // ms
```

For an always-on service, run `grove cache --prune=7` from a sidecar
cron once a day.

## Process model

By default Grove runs single-process: one Bun process per node. The
supervisor's `restart` strategy handles intra-process crashes. For
**inter-process** failures (the Bun process itself dies) use your
orchestrator's restart policy — Kubernetes Deployment, systemd `Restart=always`,
PM2, etc. The supervisor's recorder will pick up where it left off
because the SQLite DBs persist.

### Graceful shutdown

`installShutdown()` wires SIGINT + SIGTERM to a LIFO cleanup chain.
`start(...)` registers itself; `mcpServer(...)` registers itself; both
clean up on the signal. **Don't** wrap `process.exit()` around your
program — let the event loop drain naturally so `beforeExit` can flush
the recorder and stop MCP children.

```dockerfile
# Correct: PID 1 is bun, signals reach Grove.
CMD ["bun", "agent.ts"]

# Wrong: shell-form CMD wraps in /bin/sh -c, which swallows SIGTERM.
# CMD bun agent.ts
```

## Concurrency

A single agent in Grove handles one request at a time *per process*.
Internal tool calls + the model loop are async, so a process can serve
multiple requests concurrently if you don't share mutable state across
them. For high concurrency:

- **Easy**: spin up N replicas behind a load balancer. Each has its
  own `.grove/cache.db` (or share via PVC).
- **Harder, later**: distributed processes — tracked in the roadmap.

## Cost controls

Three layers, in order of impact:

1. **Tool cache** — mark anything that can be cached
   (`deterministic: true`) and run \`grove compile\` to prewarm.
2. **Prompt cache** — keep your system prompt above ~4000 tokens for
   `anthropic/*` and Grove will auto-apply `cache_control: ephemeral`.
   Verify with the `prompt_cache` events in `grove inspect`.
3. **Model selection** — addressing models with the gateway syntax
   (`provider/model`) lets you swap haiku ↔ sonnet ↔ opus per agent
   without touching code. Cheap models for routine tools, frontier
   for reasoning.

`grove cache --stats` shows cumulative cache savings. For per-day
tracking, ship a tiny sidecar that reads `.grove/cache.db` and emits
to your metrics backend.

## Observability

Default: every event is in `.grove/recordings.db`. Open `grove bench`
on a private port and you see the live timeline.

For external observability stacks (Datadog, Honeycomb, OTel):
subscribe to `getRecorder().events` and forward each event to your
collector. The event shape is documented in
[docs/spec.md](./spec.md#runtime-events).

```ts
import { getRecorder } from '@grove/runtime'
import { trace } from '@opentelemetry/api'

getRecorder().events.subscribe((ev) => {
  const span = trace.getTracer('grove').startSpan(ev.type)
  span.setAttribute('process', ev.process)
  span.setAttribute('session', ev.sessionId)
  span.setAttribute('data', JSON.stringify(ev.data))
  span.end()
})
```

## Error handling patterns

Grove's philosophy is *let it crash*. In practice:

- **Tool errors propagate by default.** If your tool throws, the
  supervisor restarts the agent under its strategy.
- **Don't try/catch around `handle.run(...)`** unless you genuinely
  want to swallow. Most of the time you want the supervisor to
  observe the crash and apply the restart policy.
- **For known-recoverable errors** in the tool body (e.g. transient
  HTTP), retry inside the tool — once. Don't loop forever.
- **For LLM errors**, set `agent({ retries: 3, timeout: 30_000 })` —
  Grove handles 5xx/429/network errors with exponential backoff.

## Live tests in CI

Run the live suite (`tests/live/`) on a schedule, not every push:

- Per-push: `bun run test` (mock backend, ~1.5s, free)
- Daily: `bun run test:live` (real Anthropic, ~15s, ~$0.01–0.05)

The `.github/workflows/ci-live.yml` template does this. Set
`secrets.ANTHROPIC_API_KEY` (or `AI_GATEWAY_API_KEY`) and you're done.

## What to monitor

The minimum dashboard we'd ship in a real shop:

- **Supervisor crashes per minute** (`event.type === 'crash'`)
- **Restart intensity hits** (when intensity guard escalates)
- **Tool cache hit rate** (per agent, ideally) — `grove cache --stats`
- **Prompt cache effective discount** (sum of `prompt_cache.cacheRead`)
- **p50/p99 model latency** (latency between `model_call` and the next
  `tool_call` or end of session)
- **MCP child process count** (lifecycle of `mcpServer(...)` handles)

All derivable from the recorder. Wire whichever export is convenient.
