/**
 * Stream settlement orchestrator.
 *
 * Settles a stream session's owed amount on-chain when the viewer stops
 * watching (explicit close, sendBeacon, or the stale-session sweep). The actual
 * mechanism is pluggable: resolveSettlementStrategies() returns the strategies
 * usable for the active chain (Circle Gateway batch when enabled, then the
 * StreamPay channel close as the always-present fallback), and this orchestrator
 * tries them in order, owning the cross-cutting status + retry policy.
 *
 * See services/settlement/ for the strategy interface, the resolver, and each
 * mechanism's implementation.
 */
import { StreamSession, type IStreamSession } from "../models/StreamSession.js";
import { settlementPublicClient } from "./settlement/context.js";
import { resolveSettlementStrategies } from "./settlement/resolver.js";

/** Back-compat re-export: streamRoutes reads receipts off this client. */
export const streamPublicClient = settlementPublicClient;

// Cap retries so a permanently bad voucher cannot loop the sweep forever
const settleAttempts = new Map<string, number>();
const MAX_SETTLE_ATTEMPTS = 3;

/**
 * Settle one session on-chain. Zero-amount sessions (no voucher yet) skip the
 * on-chain close and are marked expired: the viewer reclaims the full deposit
 * via reclaimExpired after 24h.
 */
export async function settle(session: IStreamSession): Promise<void> {
  const amount = BigInt(session.lastAmountWei || "0");

  if (amount === 0n || !session.lastSig) {
    session.status = "expired";
    await session.save();
    console.log(`[stream-settle] session ${session.sessionId}: no voucher, marked expired`);
    return;
  }

  const strategies = resolveSettlementStrategies();
  if (strategies.length === 0) {
    console.warn(`[stream-settle] session ${session.sessionId}: no settlement strategy available, leaving open for reclaim`);
    return;
  }

  session.status = "settling";
  await session.save();

  let threw: Error | null = null;
  for (const strategy of strategies) {
    try {
      const outcome = await strategy.settle(session);
      if (outcome.settled) {
        session.status = "settled";
        if (outcome.txHash) session.txHashClose = outcome.txHash;
        await session.save();
        settleAttempts.delete(session.sessionId);
        console.log(
          `[stream-settle] session ${session.sessionId}: settled via ${strategy.name}` +
            (outcome.txHash ? `, tx ${outcome.txHash}` : "")
        );
        return;
      }
      // Clean decline: try the next strategy.
      console.log(`[stream-settle] session ${session.sessionId}: ${strategy.name} declined (${outcome.reason || "n/a"})`);
    } catch (err: any) {
      // Unexpected on-chain error: remember it and try the next strategy.
      threw = err;
      console.error(`[stream-settle] session ${session.sessionId}: ${strategy.name} errored: ${err.message}`);
    }
  }

  // Nothing settled. If a strategy errored, apply the retry/expire policy;
  // otherwise leave the channel open for the 24h reclaim path.
  if (threw) {
    const attempts = (settleAttempts.get(session.sessionId) || 0) + 1;
    settleAttempts.set(session.sessionId, attempts);
    session.status = attempts >= MAX_SETTLE_ATTEMPTS ? "expired" : "open";
    await session.save();
    console.error(`[stream-settle] session ${session.sessionId}: attempt ${attempts} failed, status=${session.status}`);
  } else {
    session.status = "open";
    await session.save();
  }
}

/** Close sessions whose last heartbeat is older than 60s. */
export async function sweepStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 60_000);
  const stale = await StreamSession.find({ status: "open", lastHeartbeatAt: { $lt: cutoff } }).limit(20);
  for (const session of stale) {
    console.log(`[stream-settle] sweeping stale session ${session.sessionId} (last heartbeat ${session.lastHeartbeatAt.toISOString()})`);
    await settle(session).catch((err) => {
      console.error(`[stream-settle] sweep error for ${session.sessionId}:`, err.message);
    });
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Start the background sweep (idempotent). */
export function startSettlementSweep(intervalMs = 30_000): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepStaleSessions().catch((err) => {
      // DB may not be connected yet during startup; just log
      console.error("[stream-settle] sweep failed:", err.message);
    });
  }, intervalMs);
  sweepTimer.unref();
  console.log(`[stream-settle] stale-session sweep started (every ${intervalMs / 1000}s)`);
}
