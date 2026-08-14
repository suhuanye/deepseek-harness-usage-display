/**
 * billing RPC domain over createApiProxy: same-day usage aggregation across
 * attached sessions (priced through the default and overridden tables, with
 * unpriced routes flagged) and the balance query (credential/endpoint
 * resolution, redirect rejection on the credential-bearing request, and the
 * absent/transport/malformed answers that degrade to `balance: undefined`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import type { Session } from '@deepseek-ai/dsh-session'
import type { RpcRequest, RpcResponse } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`req-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

/** In-memory credential provider (billing balance resolution reads it). */
class MemoryCredentials extends CredentialProvider {
  private readonly values = new Map<string, string>()

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'file' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    const configured = this.values.has(ref)
    return Promise.resolve({ configured, ...configured ? { source: 'file' } : {}, writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    return Promise.resolve()
  }
}

async function harness(options?: {
  credentials?: false
  proxy?: Parameters<typeof createApiProxy>[1]
}): Promise<{ ctx: Context; api: ReturnType<typeof createApiProxy> }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  if (options?.credentials !== false) await ctx.plugin(MemoryCredentials)
  ctx.provide('workspaceRegistry', { list: () => [] } as never)
  const api = createApiProxy(ctx, options?.proxy ?? { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
  return { ctx, api }
}

/** Append one provider-reported usage sample as a finalized assistant step. */
function appendUsage(session: Session, options: {
  provider: string
  model: string
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
}): void {
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'billed' }],
      source: { kind: 'model', provider: options.provider, model: options.model },
    }),
    usage: options.usage,
  }, { surfaceOp: 'append' })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('billing.todayUsage', () => {
  it('aggregates priced usage across sessions and prices it through the default table', async () => {
    const { ctx, api } = await harness()
    const first = ctx.sessions.create()
    appendUsage(first, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 500_000, cacheWriteTokens: 100_000 },
    })
    const second = ctx.sessions.create()
    appendUsage(second, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    })

    const usage = expectOk(await api.billing.todayUsage(request({}))).usage
    // flash: (1M + 0.1M) × ¥1/M + 0.5M × ¥0.02/M + 1M × ¥2/M = 1.1 + 0.01 + 2
    // pro: 1M × ¥3/M + 1M × ¥6/M = 9
    expect(usage.spentYuan).toBeCloseTo(12.11, 10)
    expect(usage.unpriced).toBe(false)
    expect(usage.tokens).toEqual({
      inputTokens: 2_000_000,
      cacheReadTokens: 500_000,
      cacheWriteTokens: 100_000,
      outputTokens: 2_000_000,
    })
    expect(usage.byModel).toHaveLength(2)
    const flash = usage.byModel.find(row => row.model === 'deepseek-v4-flash')
    expect(flash).toMatchObject({ provider: 'deepseek-official', spentYuan: 3.11 })
  })

  it('flags routes without a configured price and still reports their tokens', async () => {
    const { ctx, api } = await harness()
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    })
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'custom-unknown',
      usage: { inputTokens: 2_000_000, outputTokens: 1_000_000 },
    })

    const usage = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(usage.unpriced).toBe(true)
    expect(usage.spentYuan).toBeCloseTo(3, 10) // only the priced flash route
    const unknown = usage.byModel.find(row => row.model === 'custom-unknown')
    expect(unknown).toMatchObject({
      inputTokens: 2_000_000,
      outputTokens: 1_000_000,
    })
    expect(unknown?.spentYuan).toBeUndefined()
  })

  it('answers zero for an empty day', async () => {
    const { api } = await harness()
    const usage = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(usage.spentYuan).toBe(0)
    expect(usage.unpriced).toBe(false)
    expect(usage.byModel).toEqual([])
  })

  it('honors an override price table', async () => {
    const { ctx, api } = await harness({
      proxy: {
        defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
        cwd: '/tmp',
        billingPrices: [
          { provider: 'p', model: 'm', inputCacheMissPerMillion: 2, inputCacheHitPerMillion: 0.5, outputPerMillion: 8 },
        ],
      },
    })
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'p',
      model: 'm',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 },
    })
    const usage = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(usage.spentYuan).toBeCloseTo(10.5, 10) // 1M × 2 + 1M × 0.5 + 1M × 8
    expect(usage.unpriced).toBe(false)
  })

  it('excludes events older than local midnight', async () => {
    const { ctx, api } = await harness()
    const session = ctx.sessions.create()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T23:00:00'))
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    })
    vi.setSystemTime(new Date('2026-08-14T10:00:00'))
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
    })
    vi.useRealTimers()

    const usage = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(usage.byModel).toHaveLength(1)
    expect(usage.tokens.inputTokens).toBe(1_000_000)
    expect(usage.spentYuan).toBeCloseTo(1, 10)
  })
})

describe('billing usage cache', () => {
  it('serves a memoized answer within the freshness window and rescans after it expires', async () => {
    const { ctx, api } = await harness({
      proxy: { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp', billingUsageCacheMs: 60_000 },
    })
    vi.useFakeTimers()
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    })
    const first = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(first.tokens.inputTokens).toBe(1_000_000)

    // New events land after the scan: the memoized answer stays until expiry.
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 2_000_000, outputTokens: 0 },
    })
    const cached = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(cached.tokens.inputTokens).toBe(1_000_000)

    vi.advanceTimersByTime(60_000)
    const fresh = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(fresh.tokens.inputTokens).toBe(3_000_000)
    vi.useRealTimers()
  })

  it('recomputes at local midnight even inside the freshness window', async () => {
    const { ctx, api } = await harness({
      proxy: { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp', billingUsageCacheMs: 300_000 },
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T23:59:00'))
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    })
    const first = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(first.tokens.inputTokens).toBe(1_000_000)

    // Next local day, still within the window: the day key forces a rescan.
    vi.setSystemTime(new Date('2026-08-15T00:00:30'))
    const nextDay = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(nextDay.tokens.inputTokens).toBe(0)
    vi.useRealTimers()
  })

  it('shares one memo between todayUsage and the OpenCode Go token figure', async () => {
    const { ctx, api } = await harness({
      proxy: { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp', billingUsageCacheMs: 60_000 },
    })
    ctx.get('credentials')?.set(credentialRef('OPENCODE_GO_API_KEY'), 'sk-go')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    vi.useFakeTimers()
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 200_000 },
    })
    const go = expectOk(await api.billing.goUsage(request({}))).usage
    expect(go?.tokens?.inputTokens).toBe(1_000_000)

    // A later todayUsage query reuses the GO pill's scan, not a fresh one.
    appendUsage(session, {
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 500_000, outputTokens: 0 },
    })
    const cached = expectOk(await api.billing.todayUsage(request({}))).usage
    expect(cached.tokens.inputTokens).toBe(1_000_000)
    vi.useRealTimers()
  })

  it('recomputes on every query when the cache window is zero', async () => {
    const { ctx, api } = await harness({
      proxy: { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp', billingUsageCacheMs: 0 },
    })
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
    })
    expect(expectOk(await api.billing.todayUsage(request({}))).usage.tokens.inputTokens).toBe(1_000_000)
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
    })
    expect(expectOk(await api.billing.todayUsage(request({}))).usage.tokens.inputTokens).toBe(2_000_000)
  })
})

describe('billing.balance', () => {
  it('answers undefined when the deployment has no credentials seam', async () => {
    const { api } = await harness({ credentials: false })
    const value = expectOk(await api.billing.balance(request({})))
    expect(value.balance).toBeUndefined()
  })

  it('fetches the balance endpoint with the resolved key and rejects redirects', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('DEEPSEEK_API_KEY'), 'sk-test')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '5.61', granted_balance: '0.00', topped_up_balance: '5.61' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const value = expectOk(await api.billing.balance(request({})))
    expect(value.balance).toEqual({
      available: true,
      balances: [{ currency: 'CNY', totalBalance: '5.61', grantedBalance: '0.00', toppedUpBalance: '5.61' }],
    })
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(input).toContain('/user/balance')
    expect(init.headers).toMatchObject({ authorization: 'Bearer sk-test' })
    // Credential-bearing provider request: a redirect must fail, never forward the key.
    expect(init.redirect).toBe('error')
  })

  it('answers undefined on a transport failure', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('DEEPSEEK_API_KEY'), 'sk-test')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const value = expectOk(await api.billing.balance(request({})))
    expect(value.balance).toBeUndefined()
  })

  it('answers undefined on a non-2xx answer', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('DEEPSEEK_API_KEY'), 'sk-test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const value = expectOk(await api.billing.balance(request({})))
    expect(value.balance).toBeUndefined()
  })

  it('answers undefined on a malformed answer body', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('DEEPSEEK_API_KEY'), 'sk-test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ surprise: true }), { status: 200 })))
    const value = expectOk(await api.billing.balance(request({})))
    expect(value.balance).toBeUndefined()
  })
})

describe('billing.goUsage', () => {
  it('answers undefined when the deployment has no OpenCode Go key', async () => {
    const { api } = await harness()
    const value = expectOk(await api.billing.goUsage(request({})))
    expect(value.usage).toBeUndefined()
  })

  it('fetches the OpenCode Go quota endpoint with the resolved key and rejects redirects', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('OPENCODE_GO_API_KEY'), 'sk-go')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      usage: {
        rolling: { status: 'ok', percent: 4, resetsAt: '2026-08-13T16:27:38.287Z' },
        weekly: { status: 'ok', percent: 3, resetsAt: '2026-08-17T00:00:00.287Z' },
        monthly: { status: 'ok', percent: 1, resetsAt: '2026-09-13T06:06:01.287Z' },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const value = expectOk(await api.billing.goUsage(request({})))
    expect(value.usage).toEqual({
      rolling: { status: 'ok', percent: 4, resetsAt: '2026-08-13T16:27:38.287Z' },
      weekly: { status: 'ok', percent: 3, resetsAt: '2026-08-17T00:00:00.287Z' },
      monthly: { status: 'ok', percent: 1, resetsAt: '2026-09-13T06:06:01.287Z' },
    })
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(input).toContain('opencode.ai/zen/go/v1/usage')
    expect(init.headers).toMatchObject({ authorization: 'Bearer sk-go' })
    // Credential-bearing provider request: a redirect must fail, never forward the key.
    expect(init.redirect).toBe('error')
  })

  it('drops degraded windows and answers undefined when none remain', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('OPENCODE_GO_API_KEY'), 'sk-go')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      usage: {
        rolling: { status: 'degraded', percent: 4, resetsAt: '2026-08-13T16:27:38.287Z' },
        weekly: { status: 'ok', percent: 3, resetsAt: '2026-08-17T00:00:00.287Z' },
      },
    }), { status: 200 })))
    const value = expectOk(await api.billing.goUsage(request({})))
    expect(value.usage?.rolling).toBeUndefined()
    expect(value.usage?.weekly).toEqual({ status: 'ok', percent: 3, resetsAt: '2026-08-17T00:00:00.287Z' })

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      usage: { rolling: { status: 'degraded', percent: 4, resetsAt: 'x' } },
    }), { status: 200 })))
    const empty = expectOk(await api.billing.goUsage(request({})))
    expect(empty.usage).toBeUndefined()
  })

  it('answers undefined on a transport failure and on a non-2xx answer', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('OPENCODE_GO_API_KEY'), 'sk-go')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect(expectOk(await api.billing.goUsage(request({}))).usage).toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    expect(expectOk(await api.billing.goUsage(request({}))).usage).toBeUndefined()
  })

  it('adds the Harness-tracked opencode-go token totals from session logs', async () => {
    const { ctx, api } = await harness()
    ctx.get('credentials')?.set(credentialRef('OPENCODE_GO_API_KEY'), 'sk-go')
    // No keyless plan answer: the endpoint fails, but the token figure from
    // the session logs must still answer.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const session = ctx.sessions.create()
    appendUsage(session, {
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 1_204_454, outputTokens: 200_840, cacheReadTokens: 61_009_792 },
    })
    // A non-GO route must not leak into the GO token figure.
    appendUsage(session, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      usage: { inputTokens: 500_000, outputTokens: 100_000 },
    })

    const value = expectOk(await api.billing.goUsage(request({})))
    expect(value.usage?.tokens).toEqual({
      inputTokens: 1_204_454,
      cacheReadTokens: 61_009_792,
      cacheWriteTokens: 0,
      outputTokens: 200_840,
    })
  })
})
