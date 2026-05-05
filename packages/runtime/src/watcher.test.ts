import { describe, expect, test } from 'bun:test'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { start } from './supervisor.ts'
import { MockBackend } from './executor.ts'
import { watchTree } from './watcher.ts'
import { getRecorder } from './recorder.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('watcher', () => {
  test('reload swaps a child def and emits hot_reload', async () => {
    // Use a fixture file inside the package so workspace resolution works.
    const fixtureDir = new URL('./__fixtures__/', import.meta.url).pathname
    const source = join(fixtureDir, 'watcher_v1.ts')
    const target = join(fixtureDir, 'watcher_active.ts')
    copyFileSync(source, target)

    const mod = await import(`${target}?fresh=${Date.now()}`)
    const startTree = mod.tree
    const { handle, sessionId } = await start(startTree, { backend: new MockBackend() })

    let reloaded: string[] = []
    const ctrl = watchTree(
      target,
      startTree,
      async (def) => {
        await (handle as unknown as {
          replace(n: string, d: typeof def): Promise<void>
        }).replace(def.name, def)
      },
      {
        debounceMs: 30,
        onReload: (changed) => {
          reloaded = [...reloaded, ...changed]
        },
      },
    )

    // Mutate by rewriting the file with a different system prompt.
    const original = readFileSync(target, 'utf8')
    const v2 = original.replace("system: 'v1'", "system: 'v2'")
    writeFileSync(target, v2)

    // fs.watch + debounce + import + apply
    await sleep(500)
    ctrl.stop()
    await handle.stop()

    expect(reloaded).toContain('svc')
    const session = getRecorder().getSession(sessionId)!
    expect(session.events.map((e) => e.type)).toContain('hot_reload')
  })
})
