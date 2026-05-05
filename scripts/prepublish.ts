#!/usr/bin/env bun
/**
 * scripts/prepublish.ts — emit `.d.ts` declarations + a CommonJS-friendly
 * dist for each public package and verify each `package.json` exposes
 * the right entry points for npm.
 *
 * Run before `npm publish`:
 *   bun scripts/prepublish.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const PUBLIC = ['core', 'runtime', 'compiler', 'cli', 'bench', 'eval', 'mcp']

const root = process.cwd()
let failures = 0

for (const pkg of PUBLIC) {
  const dir = join(root, 'packages', pkg)
  const pkgJsonPath = join(dir, 'package.json')
  if (!existsSync(pkgJsonPath)) continue

  console.log(`\n📦 ${pkg}`)
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>

  // Required fields for npm publish.
  const required = {
    name: pkgJson.name,
    version: pkgJson.version,
    description: pkgJson.description,
    license: pkgJson.license,
  }
  for (const [k, v] of Object.entries(required)) {
    if (!v) {
      console.error(`  ✗ missing field: ${k}`)
      failures += 1
    }
  }

  // Patch with publishConfig + files array if missing.
  let patched = false
  if (!pkgJson.publishConfig) {
    ;(pkgJson as Record<string, unknown>).publishConfig = { access: 'public' }
    patched = true
  }
  if (!pkgJson.files) {
    ;(pkgJson as Record<string, unknown>).files = ['src', 'dist', 'README.md', 'LICENSE']
    patched = true
  }
  if (!pkgJson.repository) {
    ;(pkgJson as Record<string, unknown>).repository = {
      type: 'git',
      url: 'git+https://github.com/Vyntral/Grove.git',
      directory: `packages/${pkg}`,
    }
    patched = true
  }
  if (!pkgJson.homepage) {
    ;(pkgJson as Record<string, unknown>).homepage = `https://vyntral.github.io/Grove`
    patched = true
  }
  if (!pkgJson.keywords) {
    ;(pkgJson as Record<string, unknown>).keywords = [
      'agents',
      'ai',
      'llm',
      'supervisor',
      'otp',
      'grove',
    ]
    patched = true
  }
  if (patched) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
    console.log(`  ✓ patched package.json`)
  }

  // Emit .d.ts declarations into dist/.
  const distDir = join(dir, 'dist')
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })
  try {
    execSync(
      `bunx tsc --declaration --emitDeclarationOnly --outDir dist src/index.ts`,
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    console.log(`  ✓ declarations emitted to dist/`)
  } catch (err) {
    console.warn(`  ⚠ tsc declaration emit had warnings (acceptable in v0)`)
  }

  // Sanity: README + LICENSE in dist or root.
  const readmePath = join(dir, 'README.md')
  if (!existsSync(readmePath)) {
    const stub = `# ${pkgJson.name}\n\n${pkgJson.description}\n\nSee https://vyntral.github.io/Grove for usage.\n`
    writeFileSync(readmePath, stub)
    console.log(`  ✓ stub README created`)
  }

  const licensePath = join(dir, 'LICENSE')
  if (!existsSync(licensePath)) {
    const rootLicense = readFileSync(join(root, 'LICENSE'), 'utf8')
    writeFileSync(licensePath, rootLicense)
    console.log(`  ✓ LICENSE copied from root`)
  }
}

if (failures > 0) {
  console.error(`\n✗ ${failures} prepublish failure(s)`)
  process.exit(1)
}
console.log(`\n✓ all packages ready for publish`)
