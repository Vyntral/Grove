# vhs tape: supervisor crash + restart demo
# Renders: docs/assets/crash.gif

Output docs/assets/crash.gif

Set FontSize 16
Set Width 1280
Set Height 580
Set Theme "Catppuccin Mocha"
Set TypingSpeed 28ms
Set PlaybackSpeed 1.0
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set Shell "bash"

# Land on a clean prompt
Type "clear"
Enter
Sleep 200ms

Type "# Grove supervisor demo: a tool throws once, supervisor restarts the agent"
Enter
Sleep 1.2s
Type "clear"
Enter
Sleep 200ms

Type "bun packages/examples/src/crash.ts"
Enter

# crash.ts: ~1s of execution; let the entire output land.
Sleep 4s

Type "# Same agent, supervisor restarted it, second call succeeds"
Enter
Sleep 2s

Type "bun packages/cli/bin/grove.ts inspect"
Enter
Sleep 2.5s

Type "# Every event captured in the recorder"
Enter
Sleep 2s
