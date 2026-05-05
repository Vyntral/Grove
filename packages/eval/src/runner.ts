import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { Process } from '@grove/runtime'
import type { CaseResult, EvalSuite, SuiteProfile } from './types.ts'

/* ─── run ──────────────────────────────────────────────────────────── */

export async function runSuite(
  suite: EvalSuite,
  handle: Process,
): Promise<SuiteProfile> {
  const results: CaseResult[] = []
  for (const c of suite.cases) {
    const t0 = performance.now()
    let output: unknown
    let passed = true
    const assertionResults: CaseResult['assertionResults'][number][] = []
    try {
      output = await handle.run(c.input)
    } catch (err) {
      output = `[error] ${err instanceof Error ? err.message : String(err)}`
      passed = false
    }
    const latencyMs = performance.now() - t0

    for (const a of c.assertions) {
      try {
        const res = a.check(output)
        if (res === true) {
          assertionResults.push({ name: a.name, passed: true })
        } else {
          assertionResults.push({ name: a.name, passed: false, reason: String(res) })
          passed = false
        }
      } catch (err) {
        assertionResults.push({
          name: a.name,
          passed: false,
          reason: err instanceof Error ? err.message : String(err),
        })
        passed = false
      }
    }

    const stringified =
      typeof output === 'string' ? output : JSON.stringify(output)
    results.push({
      id: c.id,
      outputHash: hashOutput(stringified),
      outputPreview: stringified.slice(0, 500),
      latencyMs,
      assertionResults,
      passed,
    })
  }

  return {
    suite: suite.name,
    recordedAt: new Date().toISOString(),
    gitSha: detectGitSha(),
    results,
  }
}

/* ─── persistence ──────────────────────────────────────────────────── */

const EVAL_DIR = () => join(process.cwd(), '.grove', 'eval')

export function profilePath(profile: SuiteProfile): string {
  const dir = join(EVAL_DIR(), profile.suite)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tag = profile.gitSha?.slice(0, 7) ?? `t${Date.now()}`
  return join(dir, `${tag}.json`)
}

export function saveProfile(profile: SuiteProfile): string {
  const path = profilePath(profile)
  writeFileSync(path, JSON.stringify(profile, null, 2))
  return path
}

export function loadProfile(suite: string, ref: string): SuiteProfile | null {
  const dir = join(EVAL_DIR(), suite)
  // Accept short hash, full hash, or filename.
  const candidates = [
    join(dir, `${ref}.json`),
    join(dir, `${ref.slice(0, 7)}.json`),
    join(dir, ref),
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8')) as SuiteProfile
    }
  }
  return null
}

export function listProfiles(suite: string): Array<{
  ref: string
  recordedAt: string
}> {
  const dir = join(EVAL_DIR(), suite)
  if (!existsSync(dir)) return []
  const fs = require('node:fs') as typeof import('node:fs')
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'))
  return files.map((f: string) => {
    const profile = JSON.parse(
      readFileSync(join(dir, f), 'utf8'),
    ) as SuiteProfile
    return { ref: f.replace(/\.json$/, ''), recordedAt: profile.recordedAt }
  }).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function hashOutput(s: string): string {
  // Normalise whitespace + case so trivial formatting changes don't move the hash.
  const normal = s.toLowerCase().replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(normal).digest('hex').slice(0, 16)
}

function detectGitSha(): string | null {
  try {
    const sha = execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: process.cwd(),
    })
      .toString()
      .trim()
    return sha || null
  } catch {
    return null
  }
}
