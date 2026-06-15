/**
 * Settlement resolver: pick the ordered list of strategies to try for a
 * settlement, based on the chain's capabilities and runtime config.
 *
 * This is the dispatch the team asked for ("check the chain, call the relevant
 * function"), keyed on capability rather than chain name. Order matters:
 * preferred mechanism first, with StreamPay as the always-present fallback so a
 * declined Gateway batch never drops a settlement.
 */
import type { SettlementStrategy } from "./types.js";
import { gatewayStrategy } from "./gateway-strategy.js";
import { streamPayStrategy } from "./streampay-strategy.js";

/** All known strategies, in preference order (most specific first). */
export const ALL_STRATEGIES: SettlementStrategy[] = [gatewayStrategy, streamPayStrategy];

/**
 * The strategies usable right now, in the order they should be attempted. Each
 * strategy's own isAvailable() encodes its chain capability + config gate, so a
 * chain that supports neither mechanism yields an empty list (and the caller
 * leaves the channel open for the 24h reclaim path). `candidates` is injectable
 * for tests; production callers use the default registry.
 */
export function resolveSettlementStrategies(
  candidates: SettlementStrategy[] = ALL_STRATEGIES
): SettlementStrategy[] {
  return candidates.filter((s) => s.isAvailable());
}
