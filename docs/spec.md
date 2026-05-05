# Grove API spec (v0)

Status: **draft**, evolving until v1.0. Public APIs are tagged with `@stable` in source. Anything else may change.

## Core primitives — `@grove/core`

### `tool(spec)`

Build a typed tool callable by an agent.

```ts
import { tool } from '@grove/core'
import { z } from 'zod'

const search = tool({
  name: 'search',
  description: 'Search the web for a query.',
  schema: z.object({ query: z.string() }),
  deterministic: true,        // optional; enables caching
  run: async ({ query }) => fetchResults(query),
})
```

Fields:
- `name` (string) — unique within the agent's tool set
- `description` (string) — the LLM reads this to decide when to call
- `schema` (`z.ZodType`, optional) — input validation; fed to the model as JSON Schema
- `deterministic` (boolean, default `false`) — marks the tool as a pure function of input. The compiler caches deterministic tools and may elide them entirely on cache hits.
- `run(input)` — the implementation; sync or async

### `agent(spec)`

Define an agent — a supervised process bound to a model.

```ts
const research = agent({
  name: 'research',
  model: 'anthropic/claude-opus-4-7',   // 'provider/model' (AI Gateway-compatible)
  system: 'You research topics rigorously.',
  tools: [search, summarize],
  memory: memory.persistent('notes'),
  maxSteps: 16,
  temperature: 0.2,
  invariants: ['never fabricates citations'],
})
```

Fields:
- `name`, `model` — required
- `system`, `prompt` — system prompt + optional template
- `tools` — array of `ToolDef`
- `memory` — `MemoryDef` from `memory.{ephemeral,session,persistent}(key)`
- `maxSteps` — model+tool loop cap (default 16)
- `temperature`
- `invariants` — natural-language rules the eval runner can check

### `memory.{ephemeral,session,persistent}(key)`

Memory factories. Three scopes:

- `ephemeral` — wiped at process exit
- `session` — persists across restarts within a supervisor session
- `persistent` — durable, stored under `.grove/memory/<key>`

### `supervise(spec)`

Build a supervisor tree node.

```ts
const tree = supervise({
  strategy: 'rest_for_one',
  children: [research, writer],
  restart: { intensity: 5, period: 60_000 },
})
```

Strategies — exact OTP semantics:
- `one_for_one` — restart only the failed child (default)
- `one_for_all` — restart all children when any one fails
- `rest_for_one` — restart the failed child + every child started after it

Restart policy:
- `intensity` — max restarts allowed within…
- `period` — …a sliding window of milliseconds

If `intensity` is exceeded, the supervisor itself crashes and bubbles to its parent.

## Runtime — `@grove/runtime`

### `start(tree, opts)`

Boot a supervisor tree (or solo agent). Returns:

```ts
{
  handle,        // Process — call .run(input) and .stop()
  sessionId,     // string — recorder session id
  topology,      // object — snapshot of the tree shape
}
```

### `Process`

```ts
interface Process {
  readonly id: string
  readonly name: string
  readonly kind: 'agent' | 'supervisor'
  status(): 'starting' | 'running' | 'crashed' | 'restarting' | 'stopped'
  start(): Promise<void>
  stop(): Promise<void>
  run<O>(input: unknown): Promise<O>
}
```

### `Recorder`

Process-wide singleton (`getRecorder()`). Emits `RuntimeEvent`s and persists them to `.grove/recordings.db` (SQLite). The Bench reads from this same DB.

### Backends

- `MockBackend` — deterministic stub, default. Calls the first matching tool from the agent's set, otherwise echoes a structured response. Lets every example run with zero credentials.
- `AISDKBackend` — calls Vercel AI SDK v6. Activate by setting `GROVE_BACKEND=ai-sdk` (or `import { AISDKBackend } from '@grove/runtime'` and pass it explicitly).

## Compiler — `@grove/compiler`

### `analyse(tree)` → `TopologyAnalysis`

Walks the supervisor tree, scores each agent's determinism (fraction of declared tools that are pure), and projects cost reduction per agent and overall.

### `emit(name, analysis, dir?)`

Writes a compile artifact under `<dir>/<name>/`:
- `manifest.json` — analysis snapshot + cache strategy
- `index.ts` — runtime shim (caching layer in v0.1)

## CLI — `@grove/cli`

```
grove init [file]              scaffold a new agent file
grove run <file>               execute an agent script with recording
grove inspect [session-id]     list sessions or print a session timeline
grove compile <file>           analyse a topology + emit a compile artifact
grove bench [--port=N]         launch the live web inspector
```

## Bench — `@grove/bench`

`startBench({ port? })` → Bun server with:

- `GET /` — single-page HTML inspector
- `GET /api/sessions` — list of recorded sessions
- `GET /api/sessions/:id` — session detail (events + topology)
- `GET /api/stream` — Server-Sent Events for live updates

## Stability tags

- `@stable` — backwards-compatible until next major.
- `@beta` — likely stable, may break in patch.
- `@experimental` — explicit opt-in; expect breakage.

This document is itself `@beta`. v1.0 freezes the surface.
