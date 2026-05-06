# vhs tape: full feature flyby — what Grove gives you in one minute
# Renders: docs/assets/full-demo.gif

Output docs/assets/full-demo.gif

Set FontSize 16
Set Width 1280
Set Height 640
Set Theme "Catppuccin Mocha"
Set TypingSpeed 24ms
Set PlaybackSpeed 1.0
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set Shell "bash"

# Clean slate — wipe any prior recordings so the flyby is reproducible.
Hide
Type "rm -rf .grove"
Enter
Sleep 200ms
Type "clear"
Enter
Show
Sleep 400ms

# 1. The CLI surface — every command Grove ships
Type "bun packages/cli/bin/grove.ts --help"
Enter
Sleep 5s
Type "clear"
Enter
Sleep 300ms

# 2. Supervisor — the most dramatic demo
Type "# Tool throws once. Supervisor restarts the agent. Same code, no try/catch."
Enter
Sleep 1.2s
Type "bun packages/examples/src/crash.ts"
Enter
Sleep 4s
Type "clear"
Enter
Sleep 300ms

# 3. Deterministic cache — the most surprising demo
Type "# Same input. Same output. Tool body runs exactly once across many calls."
Enter
Sleep 1.2s
Type "bun packages/examples/src/cached.ts"
Enter
Sleep 4s
Type "clear"
Enter
Sleep 300ms

# 4. Compile — the most $-flavored demo
Type "bun packages/cli/bin/grove.ts compile packages/examples/src/research.ts"
Enter
Sleep 4.5s
Type "clear"
Enter
Sleep 300ms

# 5. Recorder timeline — the time-travel value prop
Type "bun packages/cli/bin/grove.ts inspect | head -10"
Enter
Sleep 3s
