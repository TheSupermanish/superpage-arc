/**
 * Stream settlement: closes StreamPay channels on-chain with the latest
 * voucher when a viewer stops watching (explicit close, sendBeacon, or the
 * stale-session sweep).
 */
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../config/chain-config.js";
import { STREAMPAY_ADDRESS, STREAMPAY_ABI, isStreamPayDeployed } from "../config/streampay.js";
import { StreamSession, type IStreamSession } from "../models/StreamSession.js";
import { Resource, Creator } from "../models/index.js";
import { isGatewayEnabled } from "../config/gateway.js";
import { settleBatch } from "./gateway-settlement.js";

const chainConfig = getChainConfig();

const chain = defineChain({
  id: chainConfig.chainId,
  name: chainConfig.network,
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
});

export const streamPublicClient = createPublicClient({ chain, transport: http() });

function getOperatorAccount() {
  const raw = process.env.WALLET_PRIVATE_KEY || process.env.DEPLOY_PRIVATE_KEY;
  if (!raw) return null;
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
}

// Cap retries so a permanently bad voucher cannot loop the sweep forever
const settleAttempts = new Map<string, number>();
const MAX_SETTLE_ATTEMPTS = 3;

/**
 * Settle one session on-chain. Zero-amount sessions (no voucher yet) skip
 * the on-chain close and are marked expired: the viewer reclaims the full
 * deposit via reclaimExpired after 24h.
 */
export async function settle(session: IStreamSession): Promise<void> {
  const amount = BigInt(session.lastAmountWei || "0");

  if (amount === 0n || !session.lastSig) {
    session.status = "expired";
    await session.save();
    console.log(`[stream-settle] session ${session.sessionId}: no voucher, marked expired`);
    return;
  }

  // Optional, feature-flagged path: route settlement through Circle Gateway
  // batching instead of the StreamPay channel close. Only reachable when
  // GATEWAY_BATCHING is on; otherwise the StreamPay path below runs unchanged.
  if (isGatewayEnabled()) {
    const settled = await settleViaGateway(session).catch((err) => {
      console.error(`[stream-settle] session ${session.sessionId}: gateway path failed:`, err.message);
      return false;
    });
    // If the gateway path declines (no deposit, scaffolded, etc.) fall through
    // to the StreamPay close so settlement is never silently dropped.
    if (settled) return;
  }

  if (!isStreamPayDeployed()) {
    console.warn(`[stream-settle] session ${session.sessionId}: StreamPay not deployed, skipping`);
    return;
  }

  const account = getOperatorAccount();
  if (!account) {
    console.warn(`[stream-settle] session ${session.sessionId}: no WALLET_PRIVATE_KEY, skipping`);
    return;
  }

  session.status = "settling";
  await session.save();

  try {
    const walletClient = createWalletClient({ account, chain, transport: http() });
    const hash = await walletClient.writeContract({
      address: STREAMPAY_ADDRESS,
      abi: STREAMPAY_ABI,
      functionName: "closeSession",
      args: [BigInt(session.sessionId), amount, session.lastSig as `0x${string}`],
    });

    const receipt = await streamPublicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`closeSession reverted: ${hash}`);
    }

    session.status = "settled";
    session.txHashClose = hash;
    await session.save();
    settleAttempts.delete(session.sessionId);
    console.log(`[stream-settle] session ${session.sessionId}: settled ${amount} wei, tx ${hash}`);
  } catch (err: any) {
    const attempts = (settleAttempts.get(session.sessionId) || 0) + 1;
    settleAttempts.set(session.sessionId, attempts);
    console.error(`[stream-settle] session ${session.sessionId}: attempt ${attempts} failed:`, err.message);

    if (attempts >= MAX_SETTLE_ATTEMPTS) {
      // Give up: the channel stays open on-chain and the viewer can
      // reclaim the full deposit after 24h.
      session.status = "expired";
    } else {
      // Re-open so the sweep retries
      session.status = "open";
    }
    await session.save();
  }
}

/**
 * Resolve a session's creator wallet and settle it through Circle Gateway
 * batching. Returns true ONLY when a real on-chain batch submission happened;
 * otherwise returns false so the caller falls back to the StreamPay close. This
 * keeps settlement safe while the Gateway path is scaffolded: nothing is marked
 * settled until USDC has actually moved.
 */
async function settleViaGateway(session: IStreamSession): Promise<boolean> {
  const resource: any = await Resource.findById(session.resourceId).select("creatorId").lean();
  if (!resource?.creatorId) return false;
  const creator: any = await Creator.findById(resource.creatorId).select("walletAddress").lean();
  const creatorAddress = creator?.walletAddress;
  if (!creatorAddress) return false;

  const result = await settleBatch([
    { session, creatorAddress: creatorAddress as `0x${string}` },
  ]);

  if (!result.submitted) {
    // Flag on but not live yet (no deposit, scaffolded, or unsigned): log the
    // batch plan for visibility and defer to the StreamPay close.
    console.log(
      `[stream-settle] session ${session.sessionId}: gateway batch prepared but not submitted (${result.reason || "scaffold"}); owed ${result.totalUsdc} USDC, falling back to StreamPay`
    );
    return false;
  }

  session.status = "settled";
  await session.save();
  settleAttempts.delete(session.sessionId);
  console.log(`[stream-settle] session ${session.sessionId}: settled via Circle Gateway batch (${result.totalUsdc} USDC)`);
  return true;
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
