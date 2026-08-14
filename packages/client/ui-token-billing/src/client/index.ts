/**
 * Token-billing plugin, browser half: contributes two session-header
 * utilities — today's priced spend plus the provider account balance, and the
 * OpenCode Go subscription quota. All figures come from the host's apiproxy
 * `billing` domain through `ctx.connection.api`; the plugin holds no host
 * state of its own and its components keep only the latest snapshots plus a
 * refresh timer.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BillingGoUsage, ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh, type TokenBillingKey } from './locales.ts'
import { TokenBillingPill, type TokenBillingInjected, type TokenBillingSnapshot } from './TokenBillingPill.tsx'
import { GoUsagePill, type GoUsageInjected } from './GoUsagePill.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Token-billing readout copy. */
    'token-billing': TokenBillingKey
  }
}

export type { TokenBillingInjected, TokenBillingPillProps, TokenBillingSnapshot } from './TokenBillingPill.tsx'
export type { GoUsageInjected, GoUsagePillProps } from './GoUsagePill.tsx'

/** Required services for locale registration and header-slot contribution. */
export const inject = ['connection', 'sessions', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the two header utilities.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-token-billing: dictionaries')

  // Today's spend + balance pill.
  ctx.slots.inject(
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'token-billing',
      order: 10,
      locale: NS,
      inject: (): TokenBillingInjected => {
        const api = (ctx.get('connection') as ConnectionHandle).api
        return {
          refresh: async (): Promise<TokenBillingSnapshot> => {
            // The two figures are independent: a balance the deployment cannot
            // answer must not hide today's usage, and vice versa.
            const [balance, usage] = await Promise.allSettled([
              api.billing.balance({}),
              api.billing.todayUsage({}),
            ])
            return {
              balance: balance.status === 'fulfilled' && balance.value.result.ok
                ? balance.value.result.value.balance
                : undefined,
              usage: usage.status === 'fulfilled' && usage.value.result.ok
                ? usage.value.result.value.usage
                : undefined,
            }
          },
        }
      },
    }, TokenBillingPill),
  )

  // OpenCode Go subscription quota pill.
  ctx.slots.inject(
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'opencode-go',
      order: 20,
      locale: NS,
      inject: (): GoUsageInjected => {
        const api = (ctx.get('connection') as ConnectionHandle).api
        return {
          refresh: async (): Promise<BillingGoUsage | undefined> => {
            const response = await api.billing.goUsage({})
            return response.result.ok ? response.result.value.usage : undefined
          },
        }
      },
    }, GoUsagePill),
  )
}
