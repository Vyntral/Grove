import type { ToolDef } from '@grove/core'

/**
 * Configuration for an MCP server Grove can attach to.
 *
 * Currently supports stdio transport (the canonical MCP local-server form).
 * Each named server is launched as a child process, queried for its tool
 * list, and surfaces those tools as Grove `ToolDef`s.
 */
export interface McpServerConfig {
  readonly command: string
  readonly args?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, string>>
  /** Optional name override; defaults to `command`. */
  readonly name?: string
  /**
   * Optional prefix added to every tool name to disambiguate when multiple
   * MCP servers are mounted on the same agent. Default: server name + ".".
   */
  readonly prefix?: string
  /**
   * Optional allowlist — only these tool names are surfaced. Useful for
   * limiting agent capability to a vetted subset of a large server.
   */
  readonly allowlist?: ReadonlyArray<string>
}

export interface McpHandle {
  readonly tools: ReadonlyArray<ToolDef>
  /** Close the underlying transport and child process. */
  close(): Promise<void>
}

/**
 * Connect to an MCP server, fetch its tool list, and return a `McpHandle`
 * exposing those tools as Grove `ToolDef[]`.
 *
 * The returned tools are non-deterministic by default — MCP tools may have
 * arbitrary side effects. Pass `deterministic: true` per-tool yourself
 * (rare; usually requires knowing the server) if you want them cached.
 *
 * @example
 *   const fs = await mcpServer({
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
 *   })
 *   const a = agent({ ..., tools: fs.tools })
 *   await a.run('list files')
 *   await fs.close()
 */
export async function mcpServer(config: McpServerConfig): Promise<McpHandle> {
  const sdk = await loadSdk()
  const client = new sdk.Client(
    { name: 'grove', version: '0.0.3' },
    { capabilities: {} },
  )
  const transport = new sdk.StdioClientTransport({
    command: config.command,
    args: [...(config.args ?? [])],
    env: config.env as Record<string, string> | undefined,
  })

  await client.connect(transport)
  const list = await client.listTools()

  const serverName = config.name ?? config.command.split('/').pop() ?? 'mcp'
  // Default prefix uses `_` not `.` because Anthropic tool names match
  // /^[a-zA-Z0-9_-]{1,128}$/ — dots are rejected. Override per-server.
  const prefix = config.prefix ?? `${serverName}_`
  const allow = config.allowlist ? new Set(config.allowlist) : null

  const tools: ToolDef[] = []
  for (const t of list.tools) {
    if (allow && !allow.has(t.name)) continue
    tools.push(adaptTool(client, prefix, t))
  }

  const handle: McpHandle = {
    tools,
    close: async () => {
      try {
        await client.close()
      } catch {
        // close() may throw if the child already exited; ignore.
      }
    },
  }

  // Auto-register with Grove's shutdown registry so SIGINT cleans up the
  // MCP child even if the user forgot to await `handle.close()`.
  try {
    const { installShutdown, onShutdown } = (await import('@grove/runtime')) as {
      installShutdown?: () => void
      onShutdown?: (fn: () => Promise<void> | void) => void
    }
    installShutdown?.()
    onShutdown?.(() => handle.close())
  } catch {
    // @grove/runtime not available; fall through.
  }

  return handle
}

/* ─── internals ────────────────────────────────────────────────────── */

interface SdkModule {
  Client: new (info: { name: string; version: string }, opts: { capabilities: object }) => McpClient
  StdioClientTransport: new (params: {
    command: string
    args?: string[]
    env?: Record<string, string>
  }) => unknown
}

interface McpClient {
  connect(transport: unknown): Promise<void>
  close(): Promise<void>
  listTools(): Promise<{
    tools: Array<{
      name: string
      description?: string
      inputSchema?: unknown
    }>
  }>
  callTool(params: {
    name: string
    arguments?: unknown
  }): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>
}

async function loadSdk(): Promise<SdkModule> {
  try {
    const client = (await import('@modelcontextprotocol/sdk/client/index.js')) as {
      Client: SdkModule['Client']
    }
    const stdio = (await import('@modelcontextprotocol/sdk/client/stdio.js')) as {
      StdioClientTransport: SdkModule['StdioClientTransport']
    }
    return { Client: client.Client, StdioClientTransport: stdio.StdioClientTransport }
  } catch (err) {
    throw new Error(
      '[grove/mcp] requires @modelcontextprotocol/sdk. Install with:\n  bun add @modelcontextprotocol/sdk',
    )
  }
}

function adaptTool(
  client: McpClient,
  prefix: string,
  t: { name: string; description?: string; inputSchema?: unknown },
): ToolDef {
  const groveName = `${prefix}${t.name}`
  return {
    _grove: 'tool',
    name: groveName,
    description: t.description ?? `MCP tool ${t.name}`,
    schema: schemaShimFor(t.inputSchema),
    deterministic: false,
    run: async (input) => {
      const result = await client.callTool({
        name: t.name,
        arguments: input as Record<string, unknown>,
      })
      if (result.isError) {
        throw new Error(`[mcp:${groveName}] ${textOf(result.content)}`)
      }
      return textOf(result.content)
    },
  }
}

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
}

/**
 * MCP servers expose their input schemas as JSON Schema, not Zod. Grove's
 * tool schema is a structural `SchemaLike` — a `safeParse` wrapper. We
 * synthesise a minimal one that always succeeds (the MCP server itself
 * does authoritative validation). The shape is preserved as `_jsonSchema`
 * so the AI SDK / inspector can render it.
 */
function schemaShimFor(jsonSchema: unknown): ToolDef['schema'] {
  if (!jsonSchema) return undefined
  return {
    safeParse: (value: unknown) => ({ success: true as const, data: value }),
    parse: (value: unknown) => value,
    // Preserve original schema for downstream consumers.
    ...({ _jsonSchema: jsonSchema } as object),
  } as ToolDef['schema']
}

export type { ToolDef }
