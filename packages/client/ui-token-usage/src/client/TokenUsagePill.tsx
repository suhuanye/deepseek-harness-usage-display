/**
 * Session-header token-usage readout: today's priced spend and the provider
 * account balance, rendered in the right-aligned header utilities seat. The
 * host answers both figures through the apiproxy `billing` domain; this
 * component only fetches and displays. Data arrives on mount, refreshes on a
 * quiet timer, and re-fetches on click; while nothing has loaded yet the
 * entry renders nothing so an ordinary header never grows a placeholder.
 */
import { useCallback, useEffect, useState } from 'react'
import { IconRefreshOutline14, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BillingBalance, BillingTodayUsage, BillingTokenUsage } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './TokenUsagePill.module.css'

/** One combined host answer for the pill. */
export interface TokenUsageSnapshot {
  /** Provider account balance; undefined when the deployment exposes none. */
  balance: BillingBalance | undefined
  /** Today's usage across sessions; undefined when the query failed. */
  usage: BillingTodayUsage | undefined
}

/** Business face injected into the pill: a single refresh trigger. */
export interface TokenUsageInjected {
  /** Fetch the latest balance and today usage in one round trip. */
  refresh: () => Promise<TokenUsageSnapshot>
}

/** Full props: runtime share + injected share + locale seat. */
export type TokenUsagePillProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & TokenUsageInjected
  & PropsLocale<typeof NS>

/** Quiet refresh cadence; a click always refreshes immediately. */
const REFRESH_INTERVAL_MS = 60_000

/** Format a CNY figure for display. */
function yuan(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

/** Compact token count: `1.2M`, `350K`, else the raw count. */
function compactTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`
  return String(count)
}

/** Prefer the CNY row (the user asked for yuan); fall back to the first row. */
function balanceAmount(balance: BillingBalance | undefined): string | undefined {
  if (balance === undefined || balance.balances.length === 0) return undefined
  const row = balance.balances.find(item => item.currency === 'CNY') ?? balance.balances[0]
  if (row === undefined) return undefined
  const value = Number.parseFloat(row.totalBalance)
  if (!Number.isFinite(value)) return undefined
  const symbol = row.currency === 'CNY' ? '¥' : row.currency === 'USD' ? '$' : `${row.currency} `
  return `${symbol}${value.toFixed(2)}`
}

/** The provider route this pill's official balance and pricing refer to. */
const OFFICIAL_PROVIDER = 'deepseek-official'

/** Token totals for the official provider route only (the GO pill owns the rest). */
function officialTokenTotals(usage: BillingTodayUsage): BillingTokenUsage {
  const rows = usage.byModel.filter(row => row.provider === OFFICIAL_PROVIDER)
  return rows.reduce((total, row) => ({
    inputTokens: total.inputTokens + row.inputTokens,
    cacheReadTokens: total.cacheReadTokens + row.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + row.cacheWriteTokens,
    outputTokens: total.outputTokens + row.outputTokens,
  }), { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 })
}

/**
 * Session-header entry point for the token-usage readout.
 * @param props - runtime slot currency, the refresh face, and the translator.
 * @returns the spend/balance pill, or null until the first answer arrives.
 */
export function TokenUsagePill({ t, refresh }: TokenUsagePillProps) {
  const [snapshot, setSnapshot] = useState<TokenUsageSnapshot | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const next = await refresh()
    setSnapshot(next)
    setRefreshedAt(Date.now())
  }, [refresh])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, REFRESH_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [load])

  if (snapshot === null) return null

  const spent = snapshot.usage === undefined ? t('unavailable') : yuan(snapshot.usage.spentYuan)
  const balance = balanceAmount(snapshot.balance) ?? t('unavailable')
  const spentLabel = t('spent.today', { amount: spent })
  const balanceLabel = t('balance', { amount: balance })
  const officialTokens = snapshot.usage === undefined ? undefined : officialTokenTotals(snapshot.usage)
  const tokensLabel = officialTokens === undefined
    ? undefined
    : t('spent.tokens', { tokens: compactTokens(
      officialTokens.inputTokens + officialTokens.cacheReadTokens + officialTokens.cacheWriteTokens + officialTokens.outputTokens,
    ) })

  // The tooltip resolver runs only while the bubble is visible, so the detail
  // lines stay current with the latest refresh without re-rendering.
  const title = (): string => {
    const lines: string[] = []
    lines.push(t('tooltip.spent', { amount: spent }))
    if (officialTokens !== undefined) {
      lines.push(t('tooltip.tokens', {
        input: compactTokens(officialTokens.inputTokens + officialTokens.cacheReadTokens + officialTokens.cacheWriteTokens),
        output: compactTokens(officialTokens.outputTokens),
      }))
      if (snapshot.usage?.unpriced === true) lines.push(t('tooltip.unpriced'))
    }
    lines.push(t('tooltip.balance', { amount: balance }))
    if (refreshedAt !== null) {
      lines.push(t('tooltip.updated', { time: new Date(refreshedAt).toLocaleTimeString() }))
    }
    lines.push(t('tooltip.refresh'))
    return lines.join(' · ')
  }

  return (
    <Tooltip label={title} side="bottom" delayMs={400}>
      <button
        type="button"
        className={css.pill}
        aria-label={t('pill.aria')}
        onClick={() => { void load() }}
      >
        <span className={css.segment}>{spentLabel}</span>
        <span className={css.separator} aria-hidden="true">·</span>
        <span className={css.segment}>{balanceLabel}</span>
        {tokensLabel !== undefined && (
          <>
            <span className={css.separator} aria-hidden="true">·</span>
            <span className={css.segment}>{tokensLabel}</span>
          </>
        )}
        <IconRefreshOutline14 className={css.refresh} />
      </button>
    </Tooltip>
  )
}
