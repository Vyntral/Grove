import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRecorder } from '@grove/runtime'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf8')

interface BenchOptions {
  readonly port?: number
}

/**
 * startBench — boots an HTTP + SSE server that exposes the recorder DB
 * to the browser inspector. Single-process; reads the same SQLite file
 * that any agent run writes to.
 *
 * Routes:
 *   GET  /                    HTML inspector
 *   GET  /api/sessions        list of recent sessions
 *   GET  /api/sessions/:id    session detail with events + topology
 *   GET  /api/stream          Server-Sent Events for live updates
 */
export function startBench(opts: BenchOptions = {}) {
  const rec = getRecorder()

  // SSE clients (each is a WritableStreamDefaultWriter we keep alive)
  const sseClients = new Set<{ write: (chunk: string) => void; close: () => void }>()
  rec.events.subscribe((event) => {
    const payload = `data: ${JSON.stringify({ kind: 'event', sessionId: event.sessionId, event })}\n\n`
    for (const c of sseClients) {
      try {
        c.write(payload)
      } catch {
        sseClients.delete(c)
      }
    }
  })

  return Bun.serve({
    port: opts.port ?? 4773,

    routes: {
      '/': () =>
        new Response(HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),

      '/api/sessions': () => {
        const list = rec.listSessions()
        return Response.json(list)
      },

      '/api/sessions/:id': (req: Request & { params: { id: string } }) => {
        const id = req.params.id
        const session = rec.getSession(id)
        if (!session) return new Response('not found', { status: 404 })
        // attach topology snapshot too
        const row = (rec as any).db
          .query('SELECT topology FROM sessions WHERE id = ?')
          .get(id) as { topology: string } | null
        const topology = row?.topology ? JSON.parse(row.topology) : null
        return Response.json({ ...session, topology })
      },

      '/api/fork': async (req: Request) => {
        const body = (await req.json()) as {
          sessionId?: string
          throughIndex?: number
        }
        const id = body.sessionId
        const idx = body.throughIndex ?? 0
        if (!id) return new Response('missing sessionId', { status: 400 })
        const session = rec.getSession(id)
        if (!session) return new Response('session not found', { status: 404 })
        const prefix = session.events.slice(0, idx + 1)

        const fs = await import('node:fs')
        const path = await import('node:path')
        const dir = path.join(process.cwd(), '.grove', 'forks')
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        const forkId = `fork_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const forkPath = path.join(dir, `${forkId}.json`)
        fs.writeFileSync(
          forkPath,
          JSON.stringify(
            {
              forkedFrom: id,
              throughIndex: idx,
              throughEvent: prefix[prefix.length - 1] ?? null,
              prefix,
              createdAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        )
        return Response.json({ forkId, forkPath })
      },

      '/api/stream': () => {
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder()
            const client = {
              write: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
              close: () => {
                try {
                  controller.close()
                } catch {}
              },
            }
            sseClients.add(client)
            client.write(`: connected\n\n`)
            // Heartbeat every 15s so proxies don't kill the connection.
            const hb = setInterval(() => {
              try {
                client.write(`: hb\n\n`)
              } catch {
                clearInterval(hb)
                sseClients.delete(client)
              }
            }, 15_000)
          },
          cancel() {
            // browser disconnected
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },

    fetch() {
      return new Response('not found', { status: 404 })
    },
  })
}

