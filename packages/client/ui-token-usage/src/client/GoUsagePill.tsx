/**
 * OpenCode Go subscription readout: the plan's rolling (~5h) / weekly /
 * monthly usage percentages plus the token totals the Harness itself recorded
 * for the `opencode-go` route today, rendered as a compact pill beside the
 * token spend/balance pill in the header utilities seat. The host answers
 * through `billing.goUsage`; absent any GO data the host answers undefined
 * and this entry renders nothing.
 */
import { useCallback, useEffect, useState } from 'react'
import { IconRefreshOutline14, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BillingGoUsage, BillingTokenUsage } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './TokenUsagePill.module.css'

/** Business face injected into the GO pill: a single refresh trigger. */
export interface GoUsageInjected {
  /** Fetch the latest OpenCode Go quota and dsh-tracked tokens, or undefined when absent. */
  refresh: () => Promise<BillingGoUsage | undefined>
}

/** Full props: runtime share + injected share + locale seat. */
export type GoUsagePillProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & GoUsageInjected
  & PropsLocale<typeof NS>

/** Quiet refresh cadence; a click always refreshes immediately. */
const REFRESH_INTERVAL_MS = 60_000

/** Compact token count: `1.2M`, `350K`, else the raw count. */
function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`
  return String(count)
}

/** Window display labels in the tooltip's reset-time lines. */
function windowLabel(t: GoUsagePillProps['t'], window: 'rolling' | 'weekly' | 'monthly'): string {
  switch (window) {
    case 'rolling': return t('go.label.rolling')
    case 'weekly': return t('go.label.weekly')
    case 'monthly': return t('go.label.monthly')
    /* v8 ignore next -- closed union */
    default: return window
  }
}

/** Total billed tokens of one usage bucket (input includes cache reads/writes). */
function totalTokens(tokens: BillingTokenUsage): number {
  return tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens + tokens.outputTokens
}

/**
 * Session-header entry point for the OpenCode Go quota readout.
 * @param props - runtime slot currency, the refresh face, and the translator.
 * @returns the GO pill, or null until an answer arrives or when nothing is
 * displayable (no windows, no tokens).
 */
export function GoUsagePill({ t, refresh }: GoUsagePillProps) {
  const [usage, setUsage] = useState<BillingGoUsage | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const next = await refresh()
    if (next !== undefined) {
      setUsage(next)
      setRefreshedAt(Date.now())
    }
  }, [refresh])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, REFRESH_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [load])

  if (usage === null) return null

  // Defensively skip degraded windows even though the host already filters
  // them: the wire schema admits any status, so a future host change must not
  // surface a broken percentage.
  const segments: string[] = []
  if (usage.rolling?.status === 'ok') segments.push(t('go.rolling', { percent: usage.rolling.percent }))
  if (usage.weekly?.status === 'ok') segments.push(t('go.weekly', { percent: usage.weekly.percent }))
  if (usage.monthly?.status === 'ok') segments.push(t('go.monthly', { percent: usage.monthly.percent }))
  if (usage.tokens !== undefined) {
    segments.push(t('go.tokens', { tokens: formatTokens(totalTokens(usage.tokens)) }))
  }
  if (segments.length === 0) return null

  const title = (): string => {
    const lines: string[] = [t('go.tooltip.title')]
    for (const [key, window] of [['rolling', usage.rolling], ['weekly', usage.weekly], ['monthly', usage.monthly]] as const) {
      if (window?.status !== 'ok') continue
      lines.push(t('go.tooltip.window', {
        label: windowLabel(t, key),
        percent: window.percent,
        time: new Date(window.resetsAt).toLocaleString(),
      }))
    }
    if (usage.tokens !== undefined) {
      lines.push(t('go.tooltip.tokens', {
        input: formatTokens(usage.tokens.inputTokens + usage.tokens.cacheReadTokens + usage.tokens.cacheWriteTokens),
        output: formatTokens(usage.tokens.outputTokens),
      }))
    }
    if (refreshedAt !== null) lines.push(t('go.tooltip.updated', { time: new Date(refreshedAt).toLocaleTimeString() }))
    lines.push(t('go.tooltip.refresh'))
    return lines.join(' · ')
  }

  return (
    <Tooltip label={title} side="bottom" delayMs={400}>
      <button
        type="button"
        className={css.pill}
        aria-label={t('go.aria')}
        onClick={() => { void load() }}
      >
        <span className={css.segment}>GO</span>
        <span className={css.separator} aria-hidden="true">·</span>
        <span className={css.segment}>{segments.join(' · ')}</span>
        <IconRefreshOutline14 className={css.refresh} />
      </button>
    </Tooltip>
  )
}
