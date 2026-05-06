# vhs tape: grove compile cost projection
# Renders: docs/assets/compile.gif

Output docs/assets/compile.gif

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

Type "clear"
Enter
Sleep 200ms

Type "# Grove compile: static analysis + cache prewarming for the runtime"
Enter
Sleep 1.5s
Type "clear"
Enter
Sleep 200ms

Type "bun packages/cli/bin/grove.ts compile packages/examples/src/research.ts"
Enter
Sleep 4s
