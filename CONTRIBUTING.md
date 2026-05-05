# Contributing to Grove

Grove is intentionally small: a few hundred lines of TypeScript across `core`, `runtime`, `compiler`, `cli`, and `bench`. Read the source. The whole thing fits in your head.

## Dev loop

```bash
git clone https://github.com/Vyntral/Grove
cd grove
bun install

# run examples
bun packages/examples/src/hello.ts
bun packages/examples/src/crash.ts
bun packages/examples/src/research.ts

# CLI
bun packages/cli/bin/grove.ts --help
bun packages/cli/bin/grove.ts compile packages/examples/src/research.ts

# Bench
bun packages/bench/bin/bench.ts
# open http://localhost:4773
```

## Pull requests

- Keep changes small and surgical. One concern per PR.
- New behavior needs a test (Bun's built-in test runner).
- New surface area in `core` or `runtime` needs a doc update in `docs/spec.md`.
- Don't add dependencies casually. Grove's appeal includes a tiny dep graph.

## Design principles

1. **Let it crash.** No defensive try/catch around model calls. The supervisor decides.
2. **Recording first.** New behaviour must be visible in the Bench. If you can't see it, you can't trust it.
3. **Zero-config WOW.** Every example must run on a fresh clone with no API keys.
4. **One install.** Avoid optional steps. If something needs setup, automate it.
5. **Boring infrastructure.** OTP semantics, SQLite, plain HTML — not the place for novelty.

## Roadmap

See [docs/roadmap.md](./docs/roadmap.md) (coming soon). Current focus:

- v0.1 — runtime cache resolver, hot-reload, Bench polish
- v0.5 — distributed processes, MCP auto-mount, behaviour diff (Autosys-inspired)
- v1.0 — frozen API, npm publish, marketing site
