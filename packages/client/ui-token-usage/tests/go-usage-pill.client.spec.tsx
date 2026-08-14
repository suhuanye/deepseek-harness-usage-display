// @vitest-environment jsdom
// GoUsagePill behavior: nothing renders before the first answer, the pill then
// shows the OpenCode Go rolling/weekly/monthly percentages, degraded windows
// are skipped, and it re-fetches on click and on the quiet refresh timer.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { BillingGoUsage } from '@deepseek-ai/dsh-client-connection/client'
import { en, zh } from '../src/client/locales.ts'
import { GoUsagePill, type GoUsageInjected } from '../src/client/GoUsagePill.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const t = makeTranslate(zh, {})

const USAGE: BillingGoUsage = {
  rolling: { status: 'ok', percent: 4, resetsAt: '2026-08-14T14:45:30.221Z' },
  weekly: { status: 'ok', percent: 3, resetsAt: '2026-08-17T00:00:00.221Z' },
  monthly: { status: 'ok', percent: 1, resetsAt: '2026-09-14T09:41:59.221Z' },
  tokens: { inputTokens: 1_204_454, cacheReadTokens: 61_009_792, cacheWriteTokens: 0, outputTokens: 200_840 },
}

function mount(refresh: GoUsageInjected['refresh']) {
  const props = {
    t,
    refresh,
  } as unknown as Parameters<typeof GoUsagePill>[0]
  return render(<GoUsagePill {...props} />)
}

describe('GoUsagePill', () => {
  it('renders nothing before the first answer and the GO pill after it', async () => {
    let resolve!: (value: BillingGoUsage | undefined) => void
    const refresh = vi.fn(() => new Promise<BillingGoUsage | undefined>((r) => { resolve = r }))
    mount(refresh)
    expect(screen.queryByRole('button')).toBeNull()
    await act(async () => { resolve(USAGE) })
    const pill = screen.getByRole('button')
    expect(pill.textContent).toContain('GO')
    expect(pill.textContent).toContain('5h 4%')
    expect(pill.textContent).toContain('周 3%')
    expect(pill.textContent).toContain('月 1%')
    // dsh-tracked token total: 1.2M + 61M + 0 + 0.2M ≈ 62.4M
    expect(pill.textContent).toContain('62.4M tok')
  })

  it('shows the token figure alone when the plan windows are degraded', async () => {
    const refresh = vi.fn(async () => ({
      rolling: { status: 'degraded', percent: 4, resetsAt: 'x' },
      tokens: { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 500_000 },
    }))
    mount(refresh)
    const pill = await screen.findByRole('button')
    expect(pill.textContent).toContain('GO')
    expect(pill.textContent).toContain('1.5M tok')
    expect(pill.textContent).not.toContain('5h')
  })

  it('renders nothing when the deployment exposes no GO usage', async () => {
    const refresh = vi.fn(async () => undefined)
    mount(refresh)
    await act(async () => {})
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('skips degraded windows and hides the pill when all are degraded', async () => {
    const refresh = vi.fn(async () => ({
      rolling: { status: 'ok', percent: 2, resetsAt: '2026-08-14T14:45:30.221Z' },
      weekly: { status: 'degraded', percent: 3, resetsAt: '2026-08-17T00:00:00.221Z' },
      monthly: { status: 'degraded', percent: 1, resetsAt: '2026-09-14T09:41:59.221Z' },
    }))
    mount(refresh)
    const pill = await screen.findByRole('button')
    expect(pill.textContent).toContain('5h 2%')
    expect(pill.textContent).not.toContain('周')

    const refreshAllDegraded = vi.fn(async () => ({
      rolling: { status: 'degraded', percent: 2, resetsAt: 'x' },
    }))
    mount(refreshAllDegraded)
    await act(async () => {})
    // The second mount's pill would not render; only the first mount's exists.
    expect(screen.getAllByRole('button').length).toBe(1)
  })

  it('re-fetches on click', async () => {
    const refresh = vi.fn(async () => USAGE)
    mount(refresh)
    const pill = await screen.findByRole('button')
    expect(refresh).toHaveBeenCalledTimes(1)
    pill.click()
    await act(async () => { await Promise.resolve() })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})
