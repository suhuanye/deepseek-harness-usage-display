/**
 * ui-token-usage plugin halves: the browser entry's dictionary and
 * header-utility registrations against the real SlotRegistry (with fiber
 * teardown proving removal — HMR safety), the inert node entry, and the
 * invariant companion's ownership reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as TokenUsageInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Slot ledger reader: entry ids currently registered in the header utilities list. */
function utilityEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('conversation.session.header.utilities')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares the utilities list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {})
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port; the billing inject reads the billing domain.
  ctx.provide('connection', {
    api: {
      billing: {
        balance: vi.fn(async () => ({ result: { ok: true, value: {} } })),
        todayUsage: vi.fn(async () => ({
          result: {
            ok: true,
            value: {
              usage: {
                since: 0, spentYuan: 0,
                tokens: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
                byModel: [], unpriced: false,
              },
            },
          },
        })),
        goUsage: vi.fn(async () => ({ result: { ok: true, value: {} } })),
      },
    },
    isLoopback: false,
  } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-token-usage browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['connection', 'sessions', 'slots', 'locale'])
  })

  it('registers both header utilities, and fiber teardown removes them (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(utilityEntryIds(ctx)).toContain('token-usage')
    expect(utilityEntryIds(ctx)).toContain('opencode-go')
    await fiber.dispose()
    expect(utilityEntryIds(ctx)).not.toContain('token-usage')
    expect(utilityEntryIds(ctx)).not.toContain('opencode-go')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('spent.today', { amount: '¥1.00' })).toBe(zh['spent.today'].replace('{amount}', '¥1.00'))
    ctx.locale.setLocale('en')
    expect(translate('spent.today', { amount: '¥1.00' })).toBe(en['spent.today'].replace('{amount}', '¥1.00'))

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('spent.today')).not.toBe(en['spent.today'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-token-usage node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyNode).not.toThrow()
  })
})

describe('ui-token-usage invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(TokenUsageInvariant)
    await fiber.await()
    expect(TokenUsageInvariant.name).toBe('client-ui-token-usage-invariant')
    expect(TokenUsageInvariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
