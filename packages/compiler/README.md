# @vyntral/grove-compiler

> Static analysis + cache prewarming for Grove agent topologies.

`grove compile <file>` (from `@vyntral/grove-cli`) calls into this
package. It walks your supervisor tree, scores each agent's
determinism, projects the cost reduction the runtime cache will
achieve, and **prewarms the cache** by running each deterministic tool
against its declared `examples`. After a clean compile, cold-start
runs hit the cache for known inputs without paying for the first miss.

```bash
bun add @vyntral/grove-compiler
```

```ts
import { tool } from '@vyntral/grove-core'

const lookup = tool({
  name: 'lookup',
  schema: z.object({ key: z.string() }),
  deterministic: true,
  examples: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
  run: ({ key }) => /* ... */,
})
```

```bash
$ grove compile agent.ts
total cost projection: $0.1440 → $0.0144 (10.0× cheaper)
✓ prewarmed cache with 3 entries
```

Site: https://vyntral.github.io/Grove · Source: https://github.com/Vyntral/Grove

MIT.
