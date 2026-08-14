/** `token-billing` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'token-billing'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'pill.aria': '今日 token 花费与账户余额，点击刷新',
  'spent.today': '今日 {amount}',
  'spent.tokens': '{tokens} tok',
  'balance': '余额 {amount}',
  'unavailable': '—',
  'tooltip.title': '今日 token 花费 · 账户余额',
  'tooltip.spent': '今日花费：{amount}',
  'tooltip.balance': '账户余额：{amount}',
  'tooltip.tokens': '输入 {input} · 输出 {output}',
  'tooltip.unpriced': '部分模型未配置单价，元数未含其费用',
  'tooltip.updated': '更新于 {time}',
  'tooltip.refresh': '点击刷新',
  'go.aria': 'OpenCode Go 套餐用量，点击刷新',
  'go.rolling': '5h {percent}%',
  'go.weekly': '周 {percent}%',
  'go.monthly': '月 {percent}%',
  'go.label.rolling': '滚动(5h)',
  'go.label.weekly': '周',
  'go.label.monthly': '月',
  'go.tokens': '{tokens} tok',
  'go.tooltip.title': 'OpenCode Go 套餐用量',
  'go.tooltip.window': '{label}：{percent}% · 重置 {time}',
  'go.tooltip.tokens': '今日用量：输入 {input} · 输出 {output}',
  'go.tooltip.updated': '更新于 {time}',
  'go.tooltip.refresh': '点击刷新',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TokenBillingKey, string> = {
  'pill.aria': 'Today\'s token spend and account balance, click to refresh',
  'spent.today': 'Today {amount}',
  'spent.tokens': '{tokens} tok',
  'balance': 'Balance {amount}',
  'unavailable': '—',
  'tooltip.title': 'Today\'s token spend · account balance',
  'tooltip.spent': 'Spent today: {amount}',
  'tooltip.balance': 'Account balance: {amount}',
  'tooltip.tokens': 'Input {input} · Output {output}',
  'tooltip.unpriced': 'Some models have no configured price; their cost is not included',
  'tooltip.updated': 'Updated {time}',
  'tooltip.refresh': 'Click to refresh',
  'go.aria': 'OpenCode Go plan usage, click to refresh',
  'go.rolling': '5h {percent}%',
  'go.weekly': 'Wk {percent}%',
  'go.monthly': 'Mo {percent}%',
  'go.label.rolling': 'rolling (5h)',
  'go.label.weekly': 'weekly',
  'go.label.monthly': 'monthly',
  'go.tokens': '{tokens} tok',
  'go.tooltip.title': 'OpenCode Go plan usage',
  'go.tooltip.window': '{label}: {percent}% · resets {time}',
  'go.tooltip.tokens': 'Used today: input {input} · output {output}',
  'go.tooltip.updated': 'Updated {time}',
  'go.tooltip.refresh': 'Click to refresh',
}

/** Key domain of the `token-billing` namespace (zh is the source of truth). */
export type TokenBillingKey = keyof typeof zh
