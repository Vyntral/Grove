# GitHub Pages — one-time setup

The site at `docs/index.html` is ready. To go live at
**https://vyntral.github.io/Grove/** you need to enable Pages once.

## Option 1 — via GitHub UI (recommended)

1. Make the repository public:
   *Settings → General → Danger Zone → Change repository visibility → Make public*
2. Enable Pages:
   *Settings → Pages → Build and deployment*
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/docs**
   - Save
3. Wait ~30 seconds. The site appears at `https://vyntral.github.io/Grove/`.

## Option 2 — via gh CLI (after the repo is public)

```bash
gh api --method POST -H "Accept: application/vnd.github+json" \
  /repos/Vyntral/Grove/pages \
  -f 'source[branch]=main' \
  -f 'source[path]=/docs'
```

## Why it didn't work yet

GitHub Pages on **private** repositories requires a paid plan (Pro / Team /
Enterprise). On a free account, Pages is only available once the repo is
public. The HTML/CSS/SVG content is already committed; the moment Pages is
enabled, GitHub serves it as-is. No build step.

## Verifying

```bash
curl -sI https://vyntral.github.io/Grove/ | head -1
# → HTTP/2 200
```

Or `open https://vyntral.github.io/Grove/` once enabled.

## Custom domain (optional, later)

If you ever buy `grove.dev` or similar, drop a one-line `docs/CNAME`:

```
grove.dev
```

Then point the domain's DNS at GitHub Pages IPs (`185.199.108.153`,
`...109.153`, `...110.153`, `...111.153`). The README's homepage URL will
need a separate find-and-replace at that point.
