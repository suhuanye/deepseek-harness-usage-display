/**
 * billing domain contract: account balance and same-day token spend for the
 * configured provider. The host owns every credential and network call — the
 * browser never sees an API key — and returns display-ready figures. The
 * domain is deliberately provider-neutral on the wire: balance rows carry the
 * provider's own currency, and usage rows carry per-route token buckets plus
 * a priced yuan figure when the deployment has a price for that route.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One currency row of a provider balance answer (DeepSeek `/user/balance`). */
export interface BalanceInfo {
  /** Account currency (`CNY` or `USD` for the DeepSeek API). */
  currency: string
  /** Total usable balance, including grants and top-ups (provider string). */
  totalBalance: string
  /** Unexpired granted balance (provider string). */
  grantedBalance: string
  /** Topped-up balance (provider string). */
  toppedUpBalance: string
}

/** Account balance projection. */
export interface BillingBalance {
  /** Whether the account currently has balance available for API calls. */
  available: boolean
  /** One row per currency the account holds. */
  balances: BalanceInfo[]
}

/** Provider-reported token buckets for one model route (disjoint counts). */
export interface BillingTokenUsage {
  /** Uncached input tokens. */
  inputTokens: number
  /** Cache-hit input tokens (billed at the cache-hit rate). */
  cacheReadTokens: number
  /** Cache-write input tokens (billed at the cache-miss input rate). */
  cacheWriteTokens: number
  /** Output tokens. */
  outputTokens: number
}

/** Same-day usage aggregated for one (provider, model) route. */
export interface BillingModelUsage extends BillingTokenUsage {
  /** Provider route the request used (`deepseek-official`, …). */
  provider: string
  /** Provider-owned model id. */
  model: string
  /**
   * Priced spend in CNY for this route, absent when the deployment has no
   * price entry for it.
   */
  spentYuan?: number
}

/** Same-day token spend across every session. */
export interface BillingTodayUsage {
  /** Epoch-ms local-day start the aggregation window opened at. */
  since: number
  /**
   * Total priced spend in CNY. Counts only routes with a configured price, so
   * `unpriced` tells the surface whether the figure is complete.
   */
  spentYuan: number
  /** Whole-window token totals across every priced and unpriced route. */
  tokens: BillingTokenUsage
  /** Per-route rows in first-use order. */
  byModel: BillingModelUsage[]
  /** True when at least one route had no configured price. */
  unpriced: boolean
}

/** One quota window of the OpenCode Go subscription plan. */
export interface BillingGoWindow {
  /** Provider status of this window's quota (`ok`, or a degraded status). */
  status: string
  /** Used percentage of this window's quota (0–100). */
  percent: number
  /** ISO timestamp when this window's quota resets. */
  resetsAt: string
}

/** OpenCode Go subscription quota across its three rolling windows. */
export interface BillingGoUsage {
  /** Rolling (~5 hour) window quota. */
  rolling?: BillingGoWindow
  /** Weekly window quota. */
  weekly?: BillingGoWindow
  /** Monthly window quota. */
  monthly?: BillingGoWindow
  /**
   * Token totals the Harness itself recorded for the `opencode-go` provider
   * since local midnight, re-derived from committed session logs — the same
   * accounting as {@link BillingTodayUsage}, filtered to the GO plan route.
   * The plan's own quota API reports percentages only, so this is the token
   * figure a surface shows without any price conversion. Absent when no
   * session used the GO route today.
   */
  tokens?: BillingTokenUsage
}

/** Billing-domain unary methods (the map keys billing.* of RpcMethodMap). */
export interface BillingApi {
  /**
   * Query the configured provider's account balance. The provider route is
   * discovered from the deployment (the `deepseek-official` settings section
   * or its environment defaults), never from the request. A deployment with
   * no API key, or a provider without a balance endpoint, answers
   * `balance: undefined` rather than an error — absence is a configuration
   * fact, not a transport failure.
   */
  balance(request: RpcRequest<{}>, signal?: AbortSignal): Promise<RpcResponse<{ balance?: BillingBalance }>>

  /**
   * Aggregate today's provider-reported usage across every session log
   * (attached and persisted) since local midnight, priced per model route
   * through the deployment's price table. Rerun any time; the scan is
   * idempotent and reads only committed events.
   */
  todayUsage(request: RpcRequest<{}>, signal?: AbortSignal): Promise<RpcResponse<{ usage: BillingTodayUsage }>>

  /**
   * Query the OpenCode Go subscription's quota across its three windows
   * (rolling ~5h / weekly / monthly), plus the token totals the Harness
   * itself recorded for the `opencode-go` route today. The plan key resolves
   * from the deployment's credential seam (`OPENCODE_GO_API_KEY` by default);
   * the token figure is re-derived from committed session logs, never priced.
   * A deployment with no key, or any query failure, answers `usage: undefined`
   * — the surface then renders nothing for the GO plan rather than an error.
   */
  goUsage(request: RpcRequest<{}>, signal?: AbortSignal): Promise<RpcResponse<{ usage?: BillingGoUsage }>>
}
