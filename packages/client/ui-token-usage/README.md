# @deepseek-ai/dsh-client-ui-token-usage

English | [中文](README.zh.md)

Session-header usage display plugin: two entries in `conversation.session.header.utilities` in the top-right of the session header — today's token usage and priced spend plus the provider account balance, and the OpenCode Go subscription quota. All figures come from the host's apiproxy `billing` domain (`billing.balance` + `billing.todayUsage` + `billing.goUsage`) through `ctx.connection.api`; this package holds no host state and the browser never sees an API key.

The usage pill renders nothing until the first answer arrives, then shows `今日 ¥x.xx · 余额 ¥y.yy` (preferring the CNY balance row, falling back to the first currency row, and a dash when the deployment exposes no balance). A click refreshes immediately; otherwise the figures refresh on a quiet 60-second timer, so a running conversation keeps the figures current without user action. Hovering shows the token buckets (input incl. cache reads/writes, output), a note when a route has no configured price, and the last refresh time.

The GO pill shows the OpenCode Go plan's rolling (~5h) / weekly / monthly usage percentages, e.g. `GO · 5h 1% · 周 0% · 月 0%`, with each window's reset time on hover. It renders nothing when the deployment has no GO key configured or every window is degraded.

Pricing lives entirely on the host: the default table covers the DeepSeek official catalog (see `DEFAULT_BILLING_PRICES` in `dsh-host-apiproxy`), and deployments override it through the gateway's `billingPrices` config. A model without a price entry still reports its token counts, flagged through the `unpriced` bit, so the yuan figure never silently understates. The GO key resolves from the credentials seam through `OPENCODE_GO_API_KEY` (overridable via the gateway's `goApiKeyEnv` config) and is queried against the plan's official `https://opencode.ai/zen/go/v1/usage` endpoint. Same-day aggregation rescans every session log at most once per `billingUsageCacheMs` (default 5 minutes); `billing.todayUsage` and the GO token figure share one memoized answer per local day, so repeated refreshes are answered instantly.

## Model Experience

None, as this package renders host-computed usage and billing facts for a human and touches no prompt, message, schema, stream, or tool result. The model's own cost accounting stays with the host's session logs and the `billing` domain.

#### KV Cache effect

None; the package never assembles or sends provider requests. It only reads host-side billing figures through the `billing` domain.

## Known Limitations and Deferred Work

- **The today window is local midnight to now** — the aggregation re-derives it from committed session logs and serves it from a per-local-day memo for `billingUsageCacheMs` (default 5 minutes); it is a display figure, not a billing record, and a provider's official invoice remains authoritative.
- **Prices are configured on the host** — the defaults are the DeepSeek official rates as published; DeepSeek announced peak/off-peak pricing effective 2026-08-17, and deployments on the new rates should set `billingPrices` accordingly (the gateway schema accepts arbitrary provider/model routes).
- **The pill is per-session chrome** — it remounts (and re-fetches) on session switch and is hidden while no session header renders; a frame-wide always-visible home would be a new shell slot.
