# @deepseek-ai/dsh-client-ui-token-usage

[English](README.md) | 中文

会话头部用量显示插件：在 `conversation.session.header.utilities` 中贡献两个条目，于会话头部右上角显示今日 token 用量与计价花费、账户余额，以及 OpenCode Go 套餐用量。所有数字均来自宿主 apiproxy 的 `billing` 域（`billing.balance` + `billing.todayUsage` + `billing.goUsage`），经 `ctx.connection.api` 获取；本包不持有任何宿主状态，浏览器侧永远看不到 API key。

用量按钮在首个应答返回前不渲染任何内容，之后显示 `今日 ¥x.xx · 余额 ¥y.yy`（优先取 CNY 余额行，回退到第一个货币行；部署未暴露余额时显示破折号）。点击立即刷新；否则按 60 秒的静默定时器刷新，使运行中的对话无需用户操作即可保持数字最新。悬停时显示 token 分桶（输入含缓存读写、输出）、某路由未配置单价时的提示，以及上次刷新时间。

GO 按钮显示 OpenCode Go 套餐的滚动（约 5 小时）/ 周 / 月三个窗口的用量百分比，例如 `GO · 5h 1% · 周 0% · 月 0%`，悬停显示每个窗口的重置时间。部署未配置 GO Key 或所有窗口均降级时不渲染任何内容。

计价完全在宿主侧完成：默认价格表覆盖 DeepSeek 官方目录（见 `dsh-host-apiproxy` 的 `DEFAULT_BILLING_PRICES`），部署可通过网关的 `billingPrices` 配置覆盖。未配置价格的模型仍会报告其 token 数，并通过 `unpriced` 位标记，因此元数字永远不会静默少计。GO Key 通过凭据仓按 `OPENCODE_GO_API_KEY` 解析（可通过网关的 `goApiKeyEnv` 配置覆盖），并查询套餐官方接口 `https://opencode.ai/zen/go/v1/usage`。当日用量聚合在每个 `billingUsageCacheMs`（默认 5 分钟）内最多全量扫描一次会话日志；`billing.todayUsage` 与 GO token 数字共享每个自然日的一份记忆化结果，因此重复刷新可即时应答。

## Model Experience

无，本包仅为人类渲染宿主计算的用量与计费事实，不触碰任何 prompt、消息、schema、流或工具结果。模型自身的成本核算保留在宿主会话日志与 `billing` 域中。

#### KV Cache effect

无；本包从不组装或发送提供商请求，仅通过宿主 `billing` 域读取计费数字。

## Known Limitations and Deferred Work

- **今日窗口为本地零点至今** —— 每次聚合从已提交的会话日志重新推导，并在 `billingUsageCacheMs`（默认 5 分钟）内按自然日提供记忆化结果；它是展示数字而非账单记录，提供商的官方账单仍具权威性。
- **价格在宿主侧配置** —— 默认值为 DeepSeek 官方已发布费率；DeepSeek 已于 2026-08-17 起实施峰谷定价，采用新费率的部署应相应设置 `billingPrices`（网关 schema 接受任意 provider/model 路由）。
- **按钮属于会话级 chrome** —— 切换会话时会重挂载（并重新拉取），无会话头部渲染时隐藏；需要全局常驻显示时需新增 shell 插槽。
