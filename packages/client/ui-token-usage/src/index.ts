/**
 * Node half of the token-usage UI plugin: an empty apply so the plugin
 * appears in the Loader tree. All behavior is browser-side (the host exposes
 * billing facts through the apiproxy `billing` domain, which this package
 * only consumes through `ctx.connection.api`).
 * @module @deepseek-ai/dsh-client-ui-token-usage
 */

/** Required services (none — this half contributes nothing on the host). */
export const inject: string[] = []

/**
 * Client plugin body (node half): no host behavior.
 * @param _ctx - cordis context (unused on the host).
 */
export function apply(_ctx: unknown): void {
  /* v8 ignore next -- the node half intentionally contributes nothing */
}
