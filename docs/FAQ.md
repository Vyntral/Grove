# FAQ

## Why Bun and not Node?

Bun gives us four things at once: native TypeScript without a build
step, native SQLite (`bun:sqlite`) used by the recorder + cache + memory
stores, native test runner used by `bun test`, and ~4× faster startup
than Node for the CLI. We track Node 24 / Deno 2 — once their
TypeScript + SQLite story is at parity, Grove will run on both.

## Does Grove work with Node?

Today, no. The runtime imports `bun:sqlite`. A Node-compatible build
would swap `bun:sqlite` for `better-sqlite3` and adjust a few APIs. It
is on the roadmap — not blocking for v1 since Bun is supported on every
major Linux/macOS/Windows host.

## "I set `cache: true` on an agent but `cacheRead` stays 0"

Anthropic's prompt-cache threshold is published as 1024 tokens but in
practice claude-haiku-4-5 only writes a cache when the system prompt
crosses about 4000 tokens of varied content. Two ways to verify:

1. Run `bun packages/examples/src/smoke-cache.ts` — that example uses a
   safely-large system prompt and reports `cacheCreated` / `cacheRead`.
2. Check `grove inspect <session>` for `prompt_cache` events. If
   `cacheCreated: 0` on the first call, your prompt is below threshold.

Pad with structured reference content; don't repeat the same sentence
50 times — Anthropic detects low-entropy content and skips caching.

## "MCP server fails to start" / "tool name has dots"

Two common gotchas:

1. **Tool name validation.** Anthropic only accepts tool names matching
   `/^[a-zA-Z0-9_-]{1,128}$/`. Grove's MCP adapter prefixes server
   tools with `<server>_` (not `<server>.`) for this reason. If you
   override `prefix:` to use dots, calls will 400 from the API.
2. **Stdio child startup.** If `mcpServer({ command: 'npx', args: [...] })`
   hangs, the child probably needs interactive flags (`-y`). Use
   `--yes` or pre-install the MCP server globally so npx isn't
   prompting.

## How does the cache key work?

`sha256(toolName + canonical-JSON(input))` truncated to 16 hex chars.
Canonical JSON sorts object keys recursively, so `{a: 1, b: 2}` and
`{b: 2, a: 1}` produce the same key. Arrays preserve order. Numbers,
strings, booleans, null serialise as standard JSON.

## "I want to reset only one tool's cache"

There's no per-tool API yet (open an issue if you need this). Today
the options are:

- `getCache().reset()` — wipes everything.
- Edit `.grove/cache.db` directly with `sqlite3 .grove/cache.db
  "DELETE FROM entries WHERE tool = 'my-tool'"`.

## "What happens if my tool throws inside a `deterministic: true` block?"

The throw propagates to the supervisor, which applies its restart
strategy. Nothing is written to the cache. The next call with the same
input will re-execute the tool. So a deterministic tool that
intermittently throws will *never* poison the cache with a bad value —
only successful executions are cached.

## "What's the difference between `cache: false` on an agent and not setting it?"

For `anthropic/*` models with a system prompt above the threshold:

- Default (unset): Grove auto-applies `cache_control: ephemeral`.
- `cache: false`: Grove never writes the breakpoint. Your system prompt
  is billed at full rate every call.
- `cache: { ttl: '1h' }`: 1-hour TTL instead of 5-minute (only available
  on Anthropic plans that support it).
- `cache: { minSystemChars: 2048 }`: lower the auto-on threshold.

For non-anthropic models the field is a no-op today.

## "Can I run Grove without an LLM provider?"

Yes — the `MockBackend` is the default. Every example in the repo runs
without API keys. The mock is deterministic enough that the supervisor,
cache, recorder, watcher, and compiler all do the right thing. You just
get canned responses instead of LLM output. `bun packages/examples/src/{hello,crash,cached,persist,research}.ts`
all run zero-cost.

## "How do I plug in a non-Anthropic / non-OpenAI provider?"

Two options:

1. **AI Gateway** (preferred) — set `AI_GATEWAY_API_KEY` and use the
   provider's gateway-style id (`provider/model`). The gateway routes.
2. **Custom backend** — implement `ExecutorBackend.execute()` and pass
   it to `start(tree, { backend: myBackend })`. The interface is small.

## "What does `grove compile` actually do?"

Walks your topology, scores per-agent determinism, projects the cost
reduction the runtime cache will deliver, and **prewarms** the cache
with `(tool, input, output)` triples produced by running each
deterministic tool against its declared `examples`. After a clean
compile, cold-start runs hit the cache for known inputs without paying
for the first miss.

It does *not* generate optimised model prompts (that's DSPy's
territory) or rewrite your code at the AST level. The artifact under
`.grove/compiled/<name>/` is a manifest + prewarm.json + a passthrough
shim — runtime cache does the heavy lifting.

## "How do I share tool cache between two services?"

Mount the same `.grove/` directory (e.g. shared PVC in Kubernetes,
NFS, or an EFS mount on AWS). SQLite handles the cross-process locking
correctly for our access pattern (mostly reads + occasional writes).

For very high concurrency, run a thin proxy that exposes the cache as
HTTP — open an issue if you want this in core.

## "What's the supervisor restart-intensity guard?"

Crash-loop protection. If a child crashes more than `intensity` times
within `period` ms, the supervisor itself crashes (instead of restarting
forever). The crash bubbles to the parent supervisor, or to your
process if it's the root. This is the OTP recipe; same numbers, same
semantics.

Default: `{ intensity: 5, period: 60_000 }` — five restarts in a minute,
then escalate.

## "Is Grove actively maintained?"

It's young. Be prepared for the v0.x API to evolve until v1.0 freezes.
We try to keep `CHANGELOG.md` honest about what changed and to follow
SemVer for `@vyntral/grove-*` packages. If you depend on a specific behaviour,
write an eval test for it (`@vyntral/grove-eval`) so regressions are caught
in CI.
