# Agent Note: The billing usage aggregation serves a memoized same-day answer

Status: implemented

English | [中文](2026-08-14-billing-usage-aggregation-cache.zh.md)

## Problem

The `billing.todayUsage` and `billing.goUsage` RPCs re-aggregated today's token usage by scanning every session log on every query. The session-header pills refresh on a 60-second timer and on each click, so every refresh spent roughly 3 s (`todayUsage`) or 5 s (`goUsage`, which also adds the live quota fetch) decompressing and parsing session artifacts. Clicking the pill lagged seconds, and the recurring scans stalled the host event loop in synchronous chunks, making the GUI feel unresponsive even when idle.

## Decision

`createApiProxy` now memoizes the same-day aggregation in a closure keyed by local-day start, shared by `billing.todayUsage` and the OpenCode Go token figure, with a configurable freshness window `billingUsageCacheMs` (default `DEFAULT_BILLING_USAGE_CACHE_MS`, 5 minutes). A query inside the window returns the memoized answer; window expiry or a new local day forces a rescan, and a window of zero disables the memo entirely. The gateway plugin schema (`ApiProxyService.Config`) exposes `billingUsageCacheMs` so a deployment trades freshness against scan cost.

## Alternatives considered

**Incremental per-session scan cursors** — deferred: persistence exposes no offset cursor shaped for this scan, and the TTL memo removes the repeated cost with one small, testable mechanism.

**Client-side refresh throttling** — rejected: the pills would still issue RPCs, and the first query after an idle period would still pay the full scan; the fix belongs where the cost is, on the host.

## Consequences

Repeated refreshes (the 60-second timer and every click) answer instantly from the memo, and the full scan runs at most once per window and is shared across both billing rows. Displayed figures may trail real usage by up to the window; the pill's tooltip already shows the last refresh time. The memo is per gateway instance (one per server process), so a restart recomputes on the first query.
