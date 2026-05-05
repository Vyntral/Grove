import type { AgentCacheConfig, AgentDef, ToolDef } from '@grove/core'
import { getCache, type DeterministicCache } from './cache.ts'
import type {
  ExecuteInput,
  ExecuteOutput,
  ExecutorBackend,
} from './types.ts'

/**
 * Wrap a tool's `run` so deterministic tools transparently consult the
 * cache before executing. Cache hits short-circuit the call entirely and
 * emit a `cache_hit` event; misses execute and persist the result.
 */
function withCache(
  tool: ToolDef,
  emit: ExecuteInput['emit'],
  cache: DeterministicCache,
  /** Best-effort cost saved per hit, projected by the compiler price table. */
  costPerCallUsd = 0,
): ToolDef['run'] {
  if (!tool.deterministic) return tool.run
  return (async (input: unknown) => {
    const cached = cache.get(tool.name, input)
    if (cached !== undefined) {
      cache.recordHitSavings(costPerCallUsd)
      emit({
        kind: 'cache_hit',
        data: { tool: tool.name, input, output: cached, savedUsd: costPerCallUsd },
      })
      return cached
    }
    emit({ kind: 'cache_miss', data: { tool: tool.name, input } })
    const out = await tool.run(input as never)
    cache.set(tool.name, input, out, costPerCallUsd)
    return out
  }) as ToolDef['run']
}

/**
 * Mock backend: deterministic, zero-cost responder used when no LLM provider
 * is wired in (or the user wants to demo Grove without API keys).
 */
export class MockBackend implements ExecutorBackend {
  async execute({ agent, user, emit }: ExecuteInput): Promise<ExecuteOutput> {
    const start = performance.now()
    const cache = getCache()

    emit({
      kind: 'model_call',
      data: {
        model: agent.model,
        backend: 'mock',
        system: agent.system,
        input: user,
      },
    })

    await sleep(50 + Math.random() * 80)

    let result: unknown = `[grove:mock] ${agent.name} processed ${JSON.stringify(user)}`

    const tools = (agent.tools ?? []) as ReadonlyArray<ToolDef>
    if (tools.length > 0 && typeof user === 'object' && user !== null) {
      const matching = tools.find((t) => {
        if (!t.schema) return false
        const parsed = (t.schema as { safeParse?: (v: unknown) => { success: boolean } })
          .safeParse?.(user)
        return parsed?.success ?? false
      })
      if (matching) {
        emit({ kind: 'tool_call', data: { tool: matching.name, input: user } })
        const wrappedRun = withCache(matching, emit, cache)
        const out = await wrappedRun(user as never)
        emit({ kind: 'tool_result', data: { tool: matching.name, output: out } })
        result = out
      }
    }

    return {
      output: result,
      cost: { promptTokens: 0, completionTokens: 0, usd: 0 },
      latencyMs: performance.now() - start,
    }
  }
}

/* ─── Vercel AI SDK v6 backend ─────────────────────────────────────── */

interface AIMod {
  generateText: (args: unknown) => Promise<unknown>
  streamText?: (args: unknown) => {
    textStream: AsyncIterable<string>
    text: Promise<string>
    usage: Promise<Record<string, number | undefined>>
    providerMetadata: Promise<unknown>
  }
  stepCountIs: (n: number) => unknown
  jsonSchema?: (schema: unknown) => unknown
}

async function resolveModel(modelId: string): Promise<unknown> {
  if (process.env.GROVE_DIRECT_PROVIDER === '1') {
    return resolveDirectProvider(modelId)
  }
  if (
    !process.env.AI_GATEWAY_API_KEY &&
    !process.env.VERCEL_OIDC_TOKEN &&
    !process.env.ANTHROPIC_API_KEY
  ) {
    throw new Error(
      '[grove] AISDKBackend needs credentials. Set AI_GATEWAY_API_KEY (recommended), ' +
        'VERCEL_OIDC_TOKEN (on Vercel), or ANTHROPIC_API_KEY + GROVE_DIRECT_PROVIDER=1.',
    )
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return modelId
  }
  return resolveDirectProvider(modelId)
}

async function resolveDirectProvider(modelId: string): Promise<unknown> {
  const slash = modelId.indexOf('/')
  if (slash < 0) {
    throw new Error(`[grove] model id "${modelId}" must be "provider/model"`)
  }
  const provider = modelId.slice(0, slash)
  const name = modelId.slice(slash + 1)
  if (provider === 'anthropic') {
    try {
      const mod = (await import('@ai-sdk/anthropic')) as {
        anthropic: (id: string) => unknown
      }
      return mod.anthropic(name)
    } catch {
      throw new Error(
        `[grove] direct provider for "${modelId}" needs @ai-sdk/anthropic. Install with: bun add @ai-sdk/anthropic`,
      )
    }
  }
  throw new Error(
    `[grove] direct provider for "${provider}" not wired yet — use AI Gateway (set AI_GATEWAY_API_KEY) or open an issue.`,
  )
}

/* ─── prompt cache (Anthropic) ─────────────────────────────────────── */

const DEFAULT_MIN_SYSTEM_CHARS = 1024

interface PromptCacheDecision {
  readonly enabled: boolean
  readonly ttl: '5m' | '1h'
  readonly reason: 'opt-out' | 'too-short' | 'wrong-provider' | 'cached'
}

function decidePromptCache(agent: AgentDef): PromptCacheDecision {
  if (agent.cache === false) return { enabled: false, ttl: '5m', reason: 'opt-out' }
  if (!agent.model.startsWith('anthropic/')) {
    return { enabled: false, ttl: '5m', reason: 'wrong-provider' }
  }
  const cfg: AgentCacheConfig =
    typeof agent.cache === 'object' && agent.cache !== null ? agent.cache : {}
  const wantSystem = cfg.system ?? true
  if (!wantSystem) return { enabled: false, ttl: '5m', reason: 'opt-out' }
  const minChars = cfg.minSystemChars ?? DEFAULT_MIN_SYSTEM_CHARS
  if (!agent.system || agent.system.length < minChars) {
    return { enabled: false, ttl: '5m', reason: 'too-short' }
  }
  return { enabled: true, ttl: cfg.ttl ?? '5m', reason: 'cached' }
}

/**
 * Build the `system` argument to generateText. When prompt caching is
 * applicable we pass the structured form documented in AI SDK v6:
 *   `{ role: 'system', content, providerOptions: { anthropic: { cacheControl } } }`
 */
function buildSystemArg(
  agent: AgentDef,
  decision: PromptCacheDecision,
): unknown {
  if (!agent.system) return undefined
  if (!decision.enabled) return agent.system
  return {
    role: 'system',
    content: agent.system,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral', ttl: decision.ttl } },
    },
  }
}

/* ─── retry / timeout helpers ──────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_RETRIES = 2

/**
 * Classifies whether a thrown error is worth a retry.
 *
 * Treats as retriable: HTTP 5xx, 408 (request timeout), 429 (rate limit),
 * and the canonical Node network errors (ECONNRESET, ETIMEDOUT, fetch
 * failed). Everything else (4xx caller-fault, validation errors, etc.)
 * goes through the first attempt's exception unchanged.
 */
function isRetriable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status =
    (err as { statusCode?: number }).statusCode ??
    (err as { status?: number }).status
  if (status === 408 || status === 429) return true
  if (status && status >= 500 && status < 600) return true
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  )
}

/** 200ms × 2^n backoff with ±20% jitter. Caps at ~6.4s on attempt 5. */
function backoffMs(attempt: number): number {
  const base = 200 * 2 ** attempt
  return Math.round(base * (0.8 + Math.random() * 0.4))
}

/* ─── AI SDK backend ───────────────────────────────────────────────── */

export class AISDKBackend implements ExecutorBackend {
  async execute({ agent, user, emit }: ExecuteInput): Promise<ExecuteOutput> {
    const start = performance.now()

    let mod: AIMod
    try {
      mod = (await import('ai')) as unknown as AIMod
    } catch {
      throw new Error(
        '[grove] AISDKBackend requires the `ai` package. Install with: bun add ai',
      )
    }

    const model = await resolveModel(agent.model)
    const cache = getCache()
    const promptCache = decidePromptCache(agent)

    emit({
      kind: 'model_call',
      data: {
        model: agent.model,
        backend: 'ai-sdk',
        gateway:
          !!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL_OIDC_TOKEN,
        promptCache: promptCache.enabled ? { ttl: promptCache.ttl } : false,
      },
    })

    // AI SDK v6 needs a recognised schema (Zod, JSON Schema via `jsonSchema()`,
    // or a Standard Schema). Grove's `SchemaLike` is a structural shim. Adapt:
    // - `_jsonSchema` flag (set by @grove/mcp) → wrap with AI SDK's jsonSchema()
    // - otherwise pass through (Zod's `~standard` shape works natively)
    const aiJsonSchema = (mod as { jsonSchema?: (s: unknown) => unknown })
      .jsonSchema
    const adaptSchema = (raw: unknown): unknown => {
      if (!raw || typeof raw !== 'object') return raw
      const _json = (raw as { _jsonSchema?: unknown })._jsonSchema
      if (_json && aiJsonSchema) return aiJsonSchema(_json)
      return raw
    }

    const tools: Record<string, unknown> = Object.fromEntries(
      (agent.tools ?? []).map((t) => {
        const wrapped = withCache(t, emit, cache)
        return [
          t.name,
          {
            description: t.description,
            inputSchema: adaptSchema(t.schema),
            execute: async (i: unknown) => {
              emit({ kind: 'tool_call', data: { tool: t.name, input: i } })
              const out = await wrapped(i as never)
              emit({ kind: 'tool_result', data: { tool: t.name, output: out } })
              return out
            },
          },
        ]
      }),
    )

    const timeout = agent.timeout ?? DEFAULT_TIMEOUT_MS
    const maxRetries = agent.retries ?? DEFAULT_RETRIES

    const callOnce = async (): Promise<unknown> => {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeout}ms`)), timeout)
      try {
        return await mod.generateText({
          model,
          system: buildSystemArg(agent, promptCache),
          prompt: typeof user === 'string' ? user : JSON.stringify(user),
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          stopWhen: agent.maxSteps ? mod.stepCountIs(agent.maxSteps) : undefined,
          temperature: agent.temperature,
          abortSignal: ac.signal,
        })
      } finally {
        clearTimeout(timer)
      }
    }

    let lastErr: unknown
    let result: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        result = await callOnce()
        break
      } catch (err) {
        lastErr = err
        const aborted = (err as { name?: string }).name === 'AbortError'
        if (aborted) {
          emit({ kind: 'timeout', data: { ms: timeout, attempt } })
          throw new Error(`[grove] model call exceeded ${timeout}ms`)
        }
        if (attempt < maxRetries && isRetriable(err)) {
          const wait = backoffMs(attempt)
          emit({
            kind: 'retry',
            data: {
              attempt: attempt + 1,
              of: maxRetries,
              waitMs: wait,
              reason: err instanceof Error ? err.message : String(err),
            },
          })
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        throw err
      }
    }
    if (result === undefined) throw lastErr

    type AIResult = {
      text: string
      usage?: {
        promptTokens?: number
        completionTokens?: number
        inputTokens?: number
        outputTokens?: number
      }
      providerMetadata?: {
        anthropic?: {
          cacheCreationInputTokens?: number
          cacheReadInputTokens?: number
          usage?: {
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
          }
        }
      }
    }
    const finalResult = result as AIResult

    const promptTokens = finalResult.usage?.inputTokens ?? finalResult.usage?.promptTokens ?? 0
    const completionTokens = finalResult.usage?.outputTokens ?? finalResult.usage?.completionTokens ?? 0

    // Anthropic surfaces cache token counts via providerMetadata.
    const anthropicMeta = finalResult.providerMetadata?.anthropic
    const cacheCreated =
      anthropicMeta?.cacheCreationInputTokens ??
      anthropicMeta?.usage?.cache_creation_input_tokens ??
      0
    const cacheRead =
      anthropicMeta?.cacheReadInputTokens ??
      anthropicMeta?.usage?.cache_read_input_tokens ??
      0

    if (promptCache.enabled) {
      emit({
        kind: 'prompt_cache',
        data: {
          ttl: promptCache.ttl,
          cacheCreated,
          cacheRead,
          // 90% input-token discount on cache reads is Anthropic's published rate.
          tokensSaved: Math.floor(cacheRead * 0.9),
        },
      })
    }

    return {
      output: finalResult.text,
      cost: { promptTokens, completionTokens, usd: 0 },
      latencyMs: performance.now() - start,
    }
  }

  /**
   * Stream the response. Identical wiring to `execute()` (cache, prompt
   * cache, tools, timeout, retry) but consumes `streamText().textStream`
   * to emit `text_chunk` events. Final output is the joined text.
   *
   * Falls back to `execute()` if AI SDK doesn't expose streamText (very
   * old versions); for current v6 it always works.
   */
  async stream(args: ExecuteInput): Promise<ExecuteOutput> {
    const start = performance.now()
    const { agent, user, emit } = args

    let mod: AIMod
    try {
      mod = (await import('ai')) as unknown as AIMod
    } catch {
      throw new Error('[grove] AISDKBackend requires `ai`. Install with: bun add ai')
    }
    if (!mod.streamText) return this.execute(args)

    const model = await resolveModel(agent.model)
    const cache = getCache()
    const promptCache = decidePromptCache(agent)

    emit({
      kind: 'model_call',
      data: {
        model: agent.model,
        backend: 'ai-sdk',
        streaming: true,
        promptCache: promptCache.enabled ? { ttl: promptCache.ttl } : false,
      },
    })

    const aiJsonSchema = mod.jsonSchema
    const adaptSchema = (raw: unknown): unknown => {
      if (!raw || typeof raw !== 'object') return raw
      const _json = (raw as { _jsonSchema?: unknown })._jsonSchema
      if (_json && aiJsonSchema) return aiJsonSchema(_json)
      return raw
    }

    const tools: Record<string, unknown> = Object.fromEntries(
      (agent.tools ?? []).map((t) => {
        const wrapped = withCache(t, emit, cache)
        return [
          t.name,
          {
            description: t.description,
            inputSchema: adaptSchema(t.schema),
            execute: async (i: unknown) => {
              emit({ kind: 'tool_call', data: { tool: t.name, input: i } })
              const out = await wrapped(i as never)
              emit({ kind: 'tool_result', data: { tool: t.name, output: out } })
              return out
            },
          },
        ]
      }),
    )

    const result = mod.streamText({
      model,
      system: buildSystemArg(agent, promptCache),
      prompt: typeof user === 'string' ? user : JSON.stringify(user),
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: agent.maxSteps ? mod.stepCountIs(agent.maxSteps) : undefined,
      temperature: agent.temperature,
    })

    let assembled = ''
    let chunkIdx = 0
    for await (const chunk of result.textStream) {
      assembled += chunk
      emit({
        kind: 'text_chunk',
        data: { idx: chunkIdx++, len: chunk.length, text: chunk },
      })
    }

    const usage = (await result.usage) as
      | {
          inputTokens?: number
          outputTokens?: number
          promptTokens?: number
          completionTokens?: number
        }
      | undefined
    const promptTokens = usage?.inputTokens ?? usage?.promptTokens ?? 0
    const completionTokens = usage?.outputTokens ?? usage?.completionTokens ?? 0

    return {
      output: assembled,
      cost: { promptTokens, completionTokens, usd: 0 },
      latencyMs: performance.now() - start,
    }
  }
}

/** Pick a backend automatically. Honours env: GROVE_BACKEND=mock|ai-sdk */
export function defaultBackend(): ExecutorBackend {
  const choice = process.env.GROVE_BACKEND ?? 'mock'
  if (choice === 'ai-sdk') return new AISDKBackend()
  return new MockBackend()
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

export function executeAgent(
  agent: AgentDef,
  input: unknown,
  emit: ExecuteInput['emit'],
  backend: ExecutorBackend = defaultBackend(),
): Promise<ExecuteOutput> {
  // Honour `stream: true` if the backend supports it; transparently falls
  // back to non-streaming execute() otherwise.
  if (agent.stream && backend.stream) {
    return backend.stream({ agent, user: input, emit })
  }
  return backend.execute({ agent, user: input, emit })
}
