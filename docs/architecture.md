# Architecture

```
┌────────────────────────────────────────────────────────────┐
│  THE BENCH — browser inspector (HTML + Tailwind + SSE)      │
├────────────────────────────────────────────────────────────┤
│  CLI (grove init / run / inspect / compile / bench)         │
├────────────────────────────────────────────────────────────┤
│  COMPILER  ── analyse tree ─→ project cost ─→ emit shim     │
├────────────────────────────────────────────────────────────┤
│  RUNTIME                                                    │
│   ├─ Supervisor (one_for_one / one_for_all / rest_for_one)  │
│   ├─ Process    (agent + mailbox + lifecycle)               │
│   ├─ Executor   (MockBackend, AISDKBackend)                 │
│   └─ Recorder   (Subject<event> + SQLite)                   │
├────────────────────────────────────────────────────────────┤
│  CORE PRIMITIVES                                            │
│   agent · tool · memory · supervise · types                 │
└────────────────────────────────────────────────────────────┘
```

## Process model

Every Grove agent is a *process* — a long-lived entity with its own lifecycle, mailbox, and supervisor. Supervisors are themselves processes that hold a list of children and a restart policy.

The runtime is single-process JavaScript today (Bun event loop). The same supervisor tree shape will be distribution-friendly in v0.5 once we shard processes across worker threads / nodes; the public API does not change.

### Lifecycle states

```
starting → running → ┬→ stopped
                     ├→ crashed → restarting → running
                     └→ crashed (max intensity) → escalated
```

The recorder emits an event for every transition.

## Supervisor strategies

When a child crashes, the supervisor consults its strategy:

| Strategy | Action |
|---|---|
| `one_for_one`  | Restart only the failed child. |
| `one_for_all`  | Stop + restart **all** children. |
| `rest_for_one` | Stop + restart the failed child and every child declared after it. |

Restart policy (`intensity` × `period`) is a sliding-window crash-loop guard. If a supervisor exceeds it, the supervisor itself dies and the failure escalates to its parent — the same OTP recipe that has run global telecom networks for decades.

## Recorder

Every state transition, tool call, model call, and crash is emitted as a `RuntimeEvent` and persisted to a SQLite database at `.grove/recordings.db`. The Bench connects to the **same database** via SSE: there's no in-memory bridge to lose, no separate observability tier to wire up, no agent code to instrument.

Schema is intentionally tiny:

```sql
sessions(id, started_at, ended_at, topology_json)
events(id, session_id, t, process, type, data_json)
```

## Compile pipeline

```
agent definition
      │
      ▼
analyse()  ── walk supervisor tree
      │
      ▼
score determinism per agent
   (declared `deterministic: true` ∪ heuristic name match)
      │
      ▼
project cost  (price table × estimated tokens × determinism factor)
      │
      ▼
emit()  ── write manifest + shim under .grove/compiled/<name>/
```

v0 emits a manifest and a passthrough shim. v0.1 will add the runtime cache resolver: deterministic tool calls keyed by `hash(tool.name, input)` will short-circuit the model loop entirely. Stable workflows — RAG, doc parsing, structured extraction — will see 10–100× cost reductions on cache hit.

## Backends

The executor is pluggable. Two backends ship:

- **`MockBackend`** — zero-credential. Returns canned responses, calls matching tools. Lets all examples and the Bench work on a fresh clone with no setup.
- **`AISDKBackend`** — lazily imports `ai` and calls Vercel AI SDK v6 with the agent's tools and model id. Provider-agnostic via the AI Gateway "provider/model" addressing scheme.

You can write your own backend by implementing `ExecutorBackend.execute(input): Promise<output>`. Useful for testing, on-prem inference servers, or custom routing.

## Why Bun

- Native TypeScript without a build step.
- Native SQLite (`bun:sqlite`) with sub-microsecond reads — perfect for the recorder.
- Native test runner.
- Native bundler when we ship to npm.
- 4× faster startup than Node for short-lived CLIs.

We will track Node 24 / Deno 2 once their TypeScript + SQLite stories are at parity.

## File layout

```
grove/
├─ packages/
│  ├─ core/        primitives (agent, tool, memory, supervise)
│  ├─ runtime/     processes, supervisors, recorder, executor
│  ├─ compiler/    workflow analysis + emit
│  ├─ cli/         grove command
│  ├─ bench/       browser inspector (HTML + SSE)
│  └─ examples/    runnable demos (hello, crash, research)
├─ docs/           manifesto, spec, architecture
└─ .grove/         runtime artifacts (recordings.db, compiled/)
```
