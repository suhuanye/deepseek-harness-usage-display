// @vitest-environment jsdom
// TokenUsagePill behavior: nothing renders before the first answer, the
// pill then shows today's priced spend and the CNY balance (or a dash when
// the deployment exposes none), and it re-fetches on click and on the quiet
// refresh timer.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { BillingBalance, BillingTodayUsage } from '@deepseek-ai/dsh-client-connection/client'
import { en, zh, NS } from '../src/client/locales.ts'
import { TokenUsagePill, type TokenUsageInjected } from '../src/client/TokenUsagePill.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const t = makeTranslate(zh, {})

const BALANCE: BillingBalance = {
  available: true,
  balances: [{ currency: 'CNY', totalBalance: '5.61', grantedBalance: '0.00', toppedUpBalance: '5.61' }],
}

const USAGE: BillingTodayUsage = {
  since: 1_752_000_000_000,
  spentYuan: 3.11,
  tokens: { inputTokens: 1_100_000, cacheReadTokens: 500_000, cacheWriteTokens: 100_000, outputTokens: 1_000_000 },
  byModel: [
    { provider: 'deepseek-official', model: 'deepseek-v4-flash', inputTokens: 1_100_000, cacheReadTokens: 500_000, cacheWriteTokens: 100_000, outputTokens: 1_000_000, spentYuan: 3.11 },
  ],
  unpriced: false,
}

function mount(refresh: TokenUsageInjected['refresh']) {
  const props = {
    t,
    refresh,
    // Runtime share members the component never reads; only the injected
    // face and the locale seat matter to this spec.
  } as unknown as Parameters<typeof TokenUsagePill>[0]
  return render(<TokenUsagePill {...props} />)
}

describe('TokenUsagePill', () => {
  it('renders nothing before the first answer and the pill after it', async () => {
    let resolve!: (value: { balance: BillingBalance | undefined; usage: BillingTodayUsage | undefined }) => void
    const refresh = vi.fn(
      () => new Promise<{ balance: BillingBalance | undefined; usage: BillingTodayUsage | undefined }>(
        (r) => { resolve = r },
      ),
    )
    mount(refresh)
    expect(screen.queryByRole('button')).toBeNull()
    await act(async () => { resolve({ balance: BALANCE, usage: USAGE }) })
    const pill = screen.getByRole('button')
    expect(pill.textContent).toContain('今日')
    expect(pill.textContent).toContain('¥3.11')
    expect(pill.textContent).toContain('余额')
    expect(pill.textContent).toContain('¥5.61')
    // official-route token total: 1.1M input + 0.5M cache read + 0.1M cache
    // write + 1M output = 2.7M
    expect(pill.textContent).toContain('2.7M tok')
  })

  it('omits the token segment when usage is unavailable', async () => {
    const refresh = vi.fn(async () => ({ balance: BALANCE, usage: undefined }))
    mount(refresh)
    const pill = await screen.findByRole('button')
    expect(pill.textContent).toContain('今日')
    expect(pill.textContent).not.toContain('tok')
  })

  it('shows a dash for the balance when the deployment exposes none', async () => {
    const refresh = vi.fn(async () => ({ balance: undefined, usage: USAGE }))
    mount(refresh)
    const pill = await screen.findByRole('button')
    expect(pill.textContent).toContain('余额 —')
  })

  it('re-fetches on click', async () => {
    const refresh = vi.fn(async () => ({ balance: BALANCE, usage: USAGE }))
    mount(refresh)
    const pill = await screen.findByRole('button')
    expect(refresh).toHaveBeenCalledTimes(1)
    pill.click()
    await act(async () => { await Promise.resolve() })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('refreshes on the quiet timer and stops on unmount', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => ({ balance: BALANCE, usage: USAGE }))
    const view = mount(refresh)
    // Flush the mount-time refresh without relying on waitFor (its timers are faked).
    await act(async () => {})
    expect(screen.getByRole('button')).toBeTruthy()
    expect(refresh).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await act(async () => {})
    expect(refresh).toHaveBeenCalledTimes(2)
    view.unmount()
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(NS).toBe('token-usage')
  })
})
