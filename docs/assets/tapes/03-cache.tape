# vhs tape: cross-process deterministic-tool cache demo
# Renders: docs/assets/cache.gif

Output docs/assets/cache.gif

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

Type "# Run twice. Second run is a different process — cache survives on disk."
Enter
Sleep 1.5s
Type "rm -rf .grove   # start fresh"
Enter
Sleep 600ms
Type "clear"
Enter
Sleep 200ms

Type "bun packages/examples/src/persist.ts"
Enter
Sleep 3s

Type "# Now in a different process — cache.db should already be warm"
Enter
Sleep 1.5s

Type "bun packages/examples/src/persist.ts"
Enter
Sleep 3s
