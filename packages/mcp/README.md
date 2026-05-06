# @vyntral/grove-mcp

> Mount tools from any Model Context Protocol stdio server as Grove
> `ToolDef[]`. Same lifecycle, same recorder, same cache as native tools.

```bash
bun add @vyntral/grove-mcp @modelcontextprotocol/sdk
```

```ts
import { agent } from '@vyntral/grove-core'
import { mcpServer } from '@vyntral/grove-mcp'

const fs = await mcpServer({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
})

const a = agent({
  name: 'librarian',
  model: 'anthropic/claude-haiku-4-5',
  tools: fs.tools,    // [filesystem_read_file, filesystem_list_dir, ...]
})

// Auto-registered with the Grove shutdown chain — Ctrl+C will stop the
// MCP child cleanly.  Or call fs.close() explicitly when done.
```

Tool names are prefixed (default `<server>_`) so they pass Anthropic's
tool-name regex.

MIT.
