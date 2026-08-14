# Agent Note：billing 用量聚合改为按自然日提供记忆化结果

Status: implemented

[English](2026-08-14-billing-usage-aggregation-cache.md) | 中文

## 问题

`billing.todayUsage` 与 `billing.goUsage` 两个 RPC 在每次查询时都全量扫描会话日志以重新聚合当日用量。会话头部的胶囊按 60 秒定时器并在每次点击时刷新，因此每次刷新都要花约 3 秒（`todayUsage`）或 5 秒（`goUsage`，还叠加了实时配额请求）解压并解析会话归档。点击胶囊会滞后数秒，而周期性扫描以同步分块方式阻塞宿主事件循环，即使空闲时也让 GUI 显得卡顿。

## 决策

`createApiProxy` 现在在闭包中以本地自然日为键记忆化当日用量聚合，由 `billing.todayUsage` 与 OpenCode Go token 数字共享，并带可配置的新鲜度窗口 `billingUsageCacheMs`（默认 `DEFAULT_BILLING_USAGE_CACHE_MS`，5 分钟）。窗口内的查询直接返回记忆化结果；窗口过期或进入新的一天时重新扫描；窗口设为 0 则完全禁用记忆化。网关插件 schema（`ApiProxyService.Config`）暴露 `billingUsageCacheMs`，供部署在新鲜度与扫描成本之间取舍。

## 备选方案

**按会话的增量扫描游标** —— 暂缓：persistence 没有针对这种扫描形态的偏移游标，而 TTL 记忆化用一个小而可测试的机制消除了重复成本。

**客户端侧刷新节流** —— 否决：胶囊仍会发起 RPC，且空闲后的首次查询仍要付出完整扫描成本；修复应落在成本所在处，即宿主侧。

## 影响

重复刷新（60 秒定时器与每次点击）从记忆化结果即时应答，完整扫描最多每窗口一次，并由两条 billing 记录共享。展示数字可能滞后真实用量至多一个窗口；胶囊的 tooltip 已显示上次刷新时间。记忆化按网关实例隔离（每个服务器进程一份），因此重启后首次查询会重新计算。
