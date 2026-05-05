#!/usr/bin/env bun
/**
 * mcp-server-fixture.ts — a minimal MCP stdio server used by `mcp-demo.ts`.
 *
 * Exposes two tools:
 *   - `echo(text)`         — returns the text unchanged
 *   - `now({ tz? })`       — returns the current ISO datetime in the requested zone
 *
 * Run via `bun packages/examples/src/mcp-server-fixture.ts` — speaks MCP
 * over stdio. Not interesting on its own; meant to be spawned by Grove.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'grove-demo-fixture',
  version: '0.0.1',
})

// `registerTool`'s inferred generic parameters explode TS depth limits at
// the call site (MCP SDK known issue); cast through `any` to avoid emitting
// the recursion. Runtime behaviour is unaffected.
;(server.registerTool as any)(
  'echo',
  {
    description: 'Echo the input text back unchanged.',
    inputSchema: { text: z.string() },
  },
  async ({ text }: { text: string }) => ({
    content: [{ type: 'text', text }],
  }),
)

;(server.registerTool as any)(
  'now',
  {
    description: 'Return the current datetime as an ISO 8601 string.',
    inputSchema: { tz: z.string().optional() },
  },
  async ({ tz }: { tz?: string }) => {
    const now = new Date()
    const formatted = tz
      ? now.toLocaleString('en-CA', { timeZone: tz, hour12: false })
      : now.toISOString()
    return { content: [{ type: 'text', text: formatted }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
