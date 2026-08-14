/**
 * billing domain zod schemas (names derived from map keys:
 * billingBalanceRequestSchema / billingBalanceValueSchema /
 * billingTodayUsageRequestSchema / billingTodayUsageValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type {
  BalanceInfo, BillingGoWindow, BillingModelUsage, BillingTokenUsage,
} from './billing.ts'

/** BalanceInfo row of billing.balance. */
export const balanceInfoSchema = z.object({
  currency: z.string().min(1),
  totalBalance: z.string(),
  grantedBalance: z.string(),
  toppedUpBalance: z.string(),
}) satisfies z.ZodType<Wire<BalanceInfo>>

/** billing.balance response value. */
export const billingBalanceValueSchema = z.object({
  balance: z.object({
    available: z.boolean(),
    balances: z.array(balanceInfoSchema),
  }).optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'billing.balance'>>>

/** billing.balance request payload. */
export const billingBalanceRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'billing.balance'>>>

/** Token buckets shared by the usage rows. */
export const billingTokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  cacheReadTokens: z.number().nonnegative(),
  cacheWriteTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
}) satisfies z.ZodType<Wire<BillingTokenUsage>>

/** One (provider, model) usage row. */
export const billingModelUsageSchema = billingTokenUsageSchema.extend({
  provider: z.string().min(1),
  model: z.string().min(1),
  spentYuan: z.number().nonnegative().optional(),
}) satisfies z.ZodType<Wire<BillingModelUsage>>

/** billing.todayUsage response value. */
export const billingTodayUsageValueSchema = z.object({
  usage: z.object({
    since: z.number().nonnegative(),
    spentYuan: z.number().nonnegative(),
    tokens: billingTokenUsageSchema,
    byModel: z.array(billingModelUsageSchema),
    unpriced: z.boolean(),
  }),
}) satisfies z.ZodType<Wire<ResponseValue<'billing.todayUsage'>>>

/** billing.todayUsage request payload. */
export const billingTodayUsageRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'billing.todayUsage'>>>

/** One OpenCode Go quota window. */
export const billingGoWindowSchema = z.object({
  status: z.string().min(1),
  percent: z.number().min(0),
  resetsAt: z.string().min(1),
}) satisfies z.ZodType<Wire<BillingGoWindow>>

/** billing.goUsage response value. */
export const billingGoUsageValueSchema = z.object({
  usage: z.object({
    rolling: billingGoWindowSchema.optional(),
    weekly: billingGoWindowSchema.optional(),
    monthly: billingGoWindowSchema.optional(),
    tokens: billingTokenUsageSchema.optional(),
  }).optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'billing.goUsage'>>>

/** billing.goUsage request payload. */
export const billingGoUsageRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'billing.goUsage'>>>
