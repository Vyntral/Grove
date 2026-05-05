# Benchmarks

> Real numbers, real Anthropic API. Reproduce with:
>
> ```bash
> ANTHROPIC_API_KEY=sk-ant-... GROVE_DIRECT_PROVIDER=1 bun scripts/bench.ts
> ```
>
> Generated 2026-05-05T23:34:50Z. Model: `anthropic/claude-haiku-4-5`. Single-machine Bun 1.3.13 on macOS arm64. Per-call event tracking subscribes to the recorder Subject so numbers are attributed to the right iteration.

## 1. Deterministic-tool cache (cross-call)

Tool: `enrich({id})` — `deterministic: true`, returns a stable shape, body
sleeps 500ms to simulate IO. Each iteration asks the model "look up account
acct-42"; same input every time.

| run        | latency (median) | tool body invocations |
| ---------- | ---------------- | --------------------- |
| cold (1st) | 2296ms           | yes                   |
| warm (×5)   | 1686ms           | no (cache hit)        |

**Speedup on cache hit: 1.4× faster** at this tool latency.
The tool body executed exactly **1 time** across **6 runs** —
the cache served identical inputs from `.grove/cache.db` without
re-executing the 500ms sleep. Cache survives across processes.

## 2. Anthropic prompt cache (system prompt ≥ ~9000 tok)

System prompt large enough to cross Anthropic's cache threshold (about
4000 tokens of varied content for haiku-4-5). Grove auto-applies
`cache_control: ephemeral` for `anthropic/*` agents; cache reads cost
about 10% of normal input tokens.

| run        | latency (median) | cache_creation_input_tokens (this call) | cache_read_input_tokens (this call) |
| ---------- | ---------------- | --------------------------------------- | ----------------------------------- |
| cold (1st) | 2740ms           | 44,062                                  | — |
| warm (×3)   | 1620ms           | —                                       | 44,062 |

At Anthropic's published 90% input-token discount on cache reads, the
saving on this prompt size is approximately
**39,655 input tokens per warm call**
that would otherwise have been billed at full rate.

## 3. Supervisor overhead

Single agent, no tools, no caching effects. Path A goes through
`start()` + supervisor + recorder + mailbox. Path B calls
`backend.execute()` directly. Difference is what supervision costs.

| path                          | latency (median) | latency (p99) |
| ----------------------------- | ---------------- | ------------- |
| supervised (start + recorder) | 676ms            | 908ms |
| bare `backend.execute()`      | 733ms            | 1207ms |

**Per-call overhead: -57ms median (within noise).**
The two paths fall well within the variance of the network round-trip
that dominates both. The cost of recording every event into SQLite + the
supervisor mailbox plumbing is dwarfed by the model call itself. In
practical terms supervision is free at the per-call level.

## What this means

- **Tool cache** is the largest cost saving Grove offers — proportional
  to your hit rate. Latency speedup scales with how slow your tools are;
  for sub-100ms tools the cost saving (no re-execution + no re-billing)
  matters more than the latency win.
- **Prompt cache** kicks in automatically for `anthropic/*` agents with
  large system prompts. No code changes — just a bigger system message.
  The dominant gain is per-token cost, not latency.
- **Supervision is essentially free** at the per-call level
  (single-digit ms). You're paying it for fault tolerance, time-travel
  inspection, and cross-process state — not performance.

## Caveats

- haiku-4-5 only; larger models will show absolute latency higher but
  the *ratios* (cache speedup, cache-read tokens saved) hold.
- Anthropic's prompt-cache threshold appears to be ~4000 tokens in
  practice for haiku-4-5 even though the published minimum is 1024;
  shorter prompts, prompt caching is a no-op (events fire with
  `cacheCreated: 0`).
- Single-machine, single-process. Multi-region cloud numbers will vary.
- Small N (4–6 per row); these are signal-grade numbers, not full
  statistical characterisation. Re-run `bun scripts/bench.ts` for your
  own.
