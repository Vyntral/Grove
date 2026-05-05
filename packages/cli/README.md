# @grove/cli

> The `grove` command. Init, run, inspect, compile, eval, diff, fork,
> cache, bench.

```bash
bun add -g @grove/cli   # or use `bunx @grove/cli` / `npx grove`
grove --help
```

```
COMMANDS
  init [file]                        scaffold a new agent file
  run [--watch] <file>               execute (with optional hot reload)
  inspect [id]                       list sessions or print a timeline
  compile <file>                     analyse + prewarm cache
  bench [--port=N]                   launch the live web inspector
  eval <file>                        run an eval suite, save a profile
  diff <suite>                       diff two eval profiles
  cache [--stats|--clear|--prune=N]  inspect or clean local state
  fork [list|load <id>]              list saved forks or replay one
```

MIT.
