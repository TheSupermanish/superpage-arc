/**
 * Settlement strategy interface.
 *
 * A strategy is one MECHANISM for settling a stream session's owed amount
 * on-chain (StreamPay channel close, Circle Gateway batch, ...). Which
 * mechanisms apply to a given chain is data, resolved in resolver.ts from the
 * chain's capability flags. The orchestrator tries the resolved strategies in
 * order and stops at the first that actually settles.
 *
 * This is the seam the team asked for: "check the chain, call the relevant
 * function" — but keyed on capability, not chain name, so a mechanism that works
 * on several chains is written once.
 */
import type { IStreamSession } from "../../models/StreamSession.js";

export interface SettlementOutcome {
  /** True only when USDC actually moved on-chain for this session. */
  settled: boolean;
  /** Settlement tx hash, when one was sent. */
  txHash?: string;
  /** Why it did not settle (so the orchestrator can fall through / log). */
  reason?: string;
}

export interface SettlementStrategy {
  /** Stable id for logs and tests (e.g. "streampay", "gateway"). */
  readonly name: string;
  /** Capability + config gate: is this mechanism usable right now? */
  isAvailable(): boolean;
  /**
   * Attempt to settle one session. Return `{ settled: false, reason }` to defer
   * to the next strategy (never throw for an expected decline); throw only on an
   * unexpected on-chain error so the orchestrator can apply its retry policy.
   */
  settle(session: IStreamSession): Promise<SettlementOutcome>;
}
