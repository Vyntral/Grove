# Security policy

## Supported versions

| Version | Status            |
| ------- | ----------------- |
| 0.0.x   | active, pre-1.0   |

While Grove is pre-1.0 only the latest minor receives security fixes.
Once we cut 1.0 this policy will be revised.

## Reporting a vulnerability

Please **do not** open a public issue for security-sensitive findings.

Email security reports to **luca.lorenzi@orizon.one** with:

- a brief description of the impact
- a reproduction (smallest agent / topology that triggers it)
- the Grove version (`grove --version`)
- whether you've shared the finding elsewhere

We will:

1. Acknowledge within 72 hours.
2. Triage and propose a fix or mitigation within 7 days.
3. Coordinate disclosure with you. Credit is given to reporters who want it.

## What counts

In scope:

- Tool-input handling that can cause arbitrary code execution beyond what
  the tool author declared (e.g. via the cache, the recorder, or memory)
- Path traversal or write-where-not-allowed via `.grove/`
- Crashes in the supervisor that escape the restart-intensity guard
- Bypass of `cache: false` opting out of prompt caching
- MCP child processes that escape `mcpServer.close()` or the shutdown chain

Out of scope:

- Issues in upstream LLM providers, in `@modelcontextprotocol/sdk`, or
  in `ai` — please report those to the respective projects.
- DoS via expensive prompts (a property of the LLM, not Grove).
- Anything requiring the attacker to already have shell access on the
  machine running Grove.
