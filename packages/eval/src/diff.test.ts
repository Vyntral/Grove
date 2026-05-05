import { describe, expect, test } from 'bun:test'
import { diffProfiles } from './diff.ts'
import type { CaseResult, SuiteProfile } from './types.ts'

const profile = (results: ReadonlyArray<CaseResult>): SuiteProfile => ({
  suite: 'test',
  recordedAt: new Date().toISOString(),
  gitSha: null,
  results,
})

const result = (
  id: string,
  outputHash: string,
  passed: boolean,
): CaseResult => ({
  id,
  outputHash,
  outputPreview: '',
  latencyMs: 0,
  assertionResults: [{ name: 'a', passed }],
  passed,
})

describe('diffProfiles', () => {
  test('same hash + same verdict → same', () => {
    const base = profile([result('a', 'h1', true)])
    const head = profile([result('a', 'h1', true)])
    expect(diffProfiles(base, head).cases[0]?.status).toBe('same')
  })

  test('different hash + still passing → drift', () => {
    const base = profile([result('a', 'h1', true)])
    const head = profile([result('a', 'h2', true)])
    expect(diffProfiles(base, head).cases[0]?.status).toBe('drift')
  })

  test('was passing, now failing → regressed', () => {
    const base = profile([result('a', 'h1', true)])
    const head = profile([result('a', 'h2', false)])
    expect(diffProfiles(base, head).cases[0]?.status).toBe('regressed')
  })

  test('was failing, now passing → improved', () => {
    const base = profile([result('a', 'h1', false)])
    const head = profile([result('a', 'h2', true)])
    expect(diffProfiles(base, head).cases[0]?.status).toBe('improved')
  })

  test('case present only in head → new', () => {
    const base = profile([])
    const head = profile([result('a', 'h2', true)])
    expect(diffProfiles(base, head).cases[0]?.status).toBe('new')
  })

  test('case present only in base → removed', () => {
    const base = profile([result('a', 'h1', true)])
    const head = profile([])
    expect(diffProfiles(base, head).cases[0]?.status).toBe('removed')
  })

  test('summary aggregates by status', () => {
    const base = profile([
      result('a', 'h1', true),
      result('b', 'h2', true),
      result('c', 'h3', true),
    ])
    const head = profile([
      result('a', 'h1', true), // same
      result('b', 'h2x', true), // drift
      result('c', 'h3', false), // regressed
      result('d', 'hd', true), // new
    ])
    const d = diffProfiles(base, head)
    expect(d.summary.same).toBe(1)
    expect(d.summary.drift).toBe(1)
    expect(d.summary.regressed).toBe(1)
    expect(d.summary.new).toBe(1)
  })
})
