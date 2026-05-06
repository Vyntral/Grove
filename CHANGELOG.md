# Changelog

All notable changes to Grove are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.5] — 2026-05-06 — first npm release

### Changed (breaking)
- **Scope renamed `@grove/*` → `@vyntral/grove-*`.** `@grove` was already
  taken on npm; rather than block on namespace negotiation, packages ship
  under the user's scope. Public install:
  ```
  bun add @vyntral/grove-core @vyntral/grove-runtime @vyntral/grove-cli
  ```
- `peerDependencies.zod` widened from `^3.23.0` to `^3.23.0 || ^4.0.0` —
  Grove uses only `safeParse()`, identical across the two majors. Fixes
  ERESOLVE for consumers on Zod 4 (the current default).
- Bumped `0.0.3 → 0.0.5` to allow re-publish under the new scope. 0.0.4
  was a broken intermediate (`workspace:*` leaked into the tarball) and
  was unpublished the same minute.

### Added
- All 7 packages live at https://www.npmjs.com/~vyntral. Verified with a
  fresh consumer install + `bunx @vyntral/grove-cli`.

### Added — real-LLM integration tests
- `tests/live/` — 6 integration tests that talk to the real Anthropic API:
  AISDK roundtrip, typed tool calling, deterministic cache hits, prompt
  caching (`cache_read > 0`), streaming chunk emission, MCP stdio end-to-end.
  Auto-skipped when `ANTHROPIC_API_KEY` + `GROVE_DIRECT_PROVIDER=1` aren't
  set, so default `bun run test` stays fast (37 tests, ~1.5s, no key) and
  `bun run test:live` runs the real suite (~15s, a few cents).
- `.github/workflows/ci-live.yml` — runs the live suite daily at 06:00 UTC
  and on manual dispatch, gated on the `ANTHROPIC_API_KEY` repo secret.
- New `test`, `test:live`, `test:all` scripts in root `package.json`.

### Added — pre-publish polish
- **Streaming**. New `agent({ stream: true })` opt-in. AISDKBackend gets a
  `stream()` method that consumes `streamText().textStream` and emits
  `text_chunk` events to the recorder as tokens arrive. The runtime
  `executeAgent()` honours the flag transparently. Falls back to
  non-streaming `execute()` if the backend can't stream.
  Demo: `packages/examples/src/stream.ts` — verified live with Claude.
- **Fork-load** completes the time-travel story. New `Recorder.forkSession()`
  copies a parent session's prefix into a fresh session id with a synthetic
  `<fork>` marker event. New CLI: `grove fork list` / `grove fork load <id>`.
- **Per-package READMEs** — proper docs at `packages/{core,runtime,compiler,
  cli,bench,eval,mcp}/README.md` (replaced auto-generated stubs).
- **Cleaner repo** — `.gitignore` now excludes `packages/*/dist/` and the
  `__fixtures__/*_active.ts` test artifacts.

### Added — production-readiness pass
- **Memory primitive is now real.** `memory.{ephemeral,session,persistent}(key)`
  is wired through to a `MemoryStore` (SQLite-backed). When an agent
  declares `memory`, the runtime auto-injects three implicit tools:
  `memory_get`, `memory_set`, `memory_list`. Session memory is namespaced
  per session id and cleared on supervisor stop; persistent memory survives
  process restarts. Was previously declared in the API but inert.
- **Retry + timeout** on the AISDKBackend. New fields on `agent({...})`:
  `timeout` (default 60s, AbortController-backed) and `retries` (default 2,
  exponential backoff 200ms × 2^n + jitter). Retries fire on 5xx/408/429
  and network errors only. New `retry` and `timeout` recorder events.
- **Graceful shutdown.** SIGINT/SIGTERM now run a registered cleanup chain
  in LIFO order with per-handler timeout. `start()` auto-registers its
  supervisor's stop. `mcpServer()` auto-registers its child-process kill.
  Test-only `_runShutdownForTests()` for verifying the pipeline.
- **Cache eviction.** `DeterministicCache` now respects `maxEntries`
  (default 10 000, configurable via `GROVE_CACHE_MAX_ENTRIES`). Eviction
  is least-recently-hit-first. New `setMaxEntries(n)` and `prewarm(entries)`.
- **Compiler is no longer symbolic.** `grove compile` now actually warms
  the runtime cache with `(tool, input, output)` triples produced by
  running each deterministic tool against its declared `examples`. New
  `tool({ ..., examples: [...] })` field. Emits `prewarm.json` alongside
  the manifest. Errors during prewarm are recorded, not thrown.

### Added — earlier in this cycle
- `@vyntral/grove-mcp` — adapter that mounts tools from any MCP stdio server as
  Grove `ToolDef[]`. New `mcpServer({ command, args, ... })` factory returns
  `{ tools, close() }`. Tool names are prefixed (default `<server>_`) to
  satisfy provider-specific name validation. Real end-to-end demo at
  `packages/examples/src/mcp-demo.ts`.
- `grove cache [--stats|--clear|--prune=DAYS]` — manage the recorder DB and
  the deterministic-tool cache. `Recorder.purge(olderThanMs)` + `Recorder.stats()`.
- `kitchen-sink.ts` example — every feature in one file (real LLM, local
  tool, MCP tool, deterministic cache, prompt cache, supervised process).
- `scripts/prepublish.ts` — emits `.d.ts` declarations into `dist/` per
  package, patches each `package.json` with `publishConfig`/`files`/
  `repository`/`homepage`/`keywords`. Verified `npm pack` produces a sane
  tarball for `@vyntral/grove-core` (5.5 KB, src + dist + LICENSE + README).
- AI SDK schema adapter — JSON-Schema-shaped tool inputs are routed through
  AI SDK v6's `jsonSchema()` helper, so MCP-mounted tools type-check across
  providers.

### Changed
- Default MCP tool prefix is `<server>_` (was `<server>.`) so Anthropic's
  tool-name regex `^[a-zA-Z0-9_-]{1,128}$` accepts them.
- Compiler manifest version bumped 0 → 1 (now includes `prewarm` summary).
  Old artifacts under `.grove/compiled/` regenerate on next `grove compile`.

### Tests
- 37 tests across 11 files (was 22). Added: 5 memory roundtrip tests,
  4 cache-eviction tests, 2 shutdown-registry tests, 4 compiler-prewarm
  tests. All green; typecheck clean.

## [0.0.3] — 2026-05-06

### Added
- `@vyntral/grove-eval` — declarative eval suites + behaviour-diff between profiles
  (Autosys-inspired). New CLI commands `grove eval <file>` and
  `grove diff <suite>`. Profiles persist under `.grove/eval/<suite>/<sha>.json`
  and the diff classifies each case as `same`, `drift`, `regressed`,
  `improved`, `new`, or `removed`. Non-zero exit on regression for CI use.
- Anthropic prompt caching, auto-on for `anthropic/*` models with system
  prompts large enough to cross Anthropic's threshold. New `cache?:` field
  on `agent({...})` for explicit control. `prompt_cache` events recorded
  with `cacheCreated` / `cacheRead` / `tokensSaved` (90% Anthropic discount).
- AI SDK v6 backend wired and verified live against `claude-haiku-4-5` —
  proper tool calling, prompt caching, gateway-first model resolution
  (`AI_GATEWAY_API_KEY`), direct-provider fallback (`GROVE_DIRECT_PROVIDER=1`).
- Bench v2 — fork-from-step modal, summary panel (events/tool cache/prompt
  cache/tokens saved/crashes/hot reloads), keyboard scrubbing
  (←/→/Home/End/F), distinct colour for `prompt_cache` events.
- `grove init` template polished: hot-reload aware, runs as CLI or via
  `bun run agent.ts`, emits session id, demonstrates deterministic tools.

### Changed
- Bumped version 0.0.1 → 0.0.3 across all `@vyntral/grove-*` packages.

## [0.0.2] — 2026-05-05 (afternoon)

### Added
- **Deterministic tool cache** — SQLite-backed, persistent across processes,
  canonical-JSON keying. `cache_hit` / `cache_miss` events to recorder.
- **Hot reload** — `watchTree()` with debounced fs.watch; per-child diff by
  structural hash; restarts only changed children.
- CLI `grove run --watch` flag.
- Examples: `cached.ts`, `persist.ts` demonstrating same-process and
  cross-process cache speedups.
- Tests: 6 cache, 1 watcher, 7 supervisor + compiler from v0.

## [0.0.1] — 2026-05-05 (morning)

### Added
- Initial release of `@vyntral/grove-core`, `@vyntral/grove-runtime`, `@vyntral/grove-compiler`,
  `@vyntral/grove-cli`, `@vyntral/grove-bench`, `@vyntral/grove-examples`.
- OTP-style supervisor with `one_for_one` / `one_for_all` / `rest_for_one`
  strategies and restart intensity guard.
- Process model: agents as supervised actors with mailboxes and lifecycle.
- Recorder: every event persisted to `.grove/recordings.db`.
- Compiler v0: topology analysis, deterministic-path tagging, cost
  projection, manifest emission.
- CLI: `init`, `run`, `inspect`, `compile`, `bench`.
- Bench v1: HTML inspector with sessions list, topology, timeline scrubber,
  step detail.
- Mock backend (zero-config) and AI SDK backend (lazy import).

[Unreleased]: https://github.com/Vyntral/Grove/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/Vyntral/Grove/releases/tag/v0.0.3
[0.0.2]: https://github.com/Vyntral/Grove/releases/tag/v0.0.2
[0.0.1]: https://github.com/Vyntral/Grove/releases/tag/v0.0.1
