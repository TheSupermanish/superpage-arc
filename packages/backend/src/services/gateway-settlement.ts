/**
 * Gateway settlement: an ADDITIVE, feature-flagged settlement path for streaming
 * that batches owed amounts through Circle Gateway instead of closing one
 * StreamPay channel per session.
 *
 * Why: StreamPay closes each session with its own on-chain tx. Circle Gateway
 * lets the operator collect many signed off-chain USDC authorizations and settle
 * them as a batch, so a busy creator with N viewers pays gas roughly once rather
 * than N times. This is gated behind GATEWAY_BATCHING (default off): when the
 * flag is unset, stream-settlement.ts never calls into this module and behaviour
 * is identical to the channel path that shipped before.
 *
 * What is live here vs scaffolded (see docs/gateway.md for the full matrix):
 *   - LIVE: read the operator/creator Gateway balance (on-chain availableBalance
 *     read + Circle's /v1/balances REST read), and the "needs deposit" guard.
 *   - SCAFFOLDED: the batch submission itself. We build the exact /v1/batch/submit
 *     request bodies (EIP-3009 transferWithAuthorization, one per session, grouped
 *     by creator) but do NOT sign or send them: the per-second voucher StreamPay
 *     uses is an eth_sign over a custom digest, not an EIP-3009 authorization, so
 *     producing a real authorization needs a viewer-side signing change. The task
 *     also forbids sending on-chain txs. submitBatch() therefore returns the fully
 *     constructed plan and stops at the network boundary unless GATEWAY_LIVE_SUBMIT
 *     is set, which is documented as the single switch to flip to go live.
 */
import { createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../config/chain-config.js";
import {
  GATEWAY_WALLET_ADDRESS,
  GATEWAY_WALLET_ABI,
  GATEWAY_API_BASE,
  getGatewayDomain,
  isGatewayEnabled,
} from "../config/gateway.js";
import { weiToUsdc } from "../config/streampay.js";
import type { IStreamSession } from "../models/StreamSession.js";

const chainConfig = getChainConfig();

const chain = defineChain({
  id: chainConfig.chainId,
  name: chainConfig.network,
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
});

/** Dedicated read client (kept separate from the StreamPay one to stay additive). */
export const gatewayPublicClient = createPublicClient({ chain, transport: http() });

/** USDC ERC-20 facade address Gateway tracks balances against on this chain. */
const USDC_ADDRESS = chainConfig.tokenAddress as `0x${string}`;

function getOperatorAccount() {
  const raw = process.env.WALLET_PRIVATE_KEY || process.env.DEPLOY_PRIVATE_KEY;
  if (!raw) return null;
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
}

/** USDC -> 6-decimal atomic units, the unit Gateway's batch API expects. */
export function usdcToAtomic(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1e6));
}

// ============================================================
// Balance surface
// ============================================================

export interface GatewayBalance {
  /** Address the balance belongs to (operator or a creator). */
  address: `0x${string}`;
  /** Circle domain id for the active chain (26 = Arc testnet). */
  domain: number | null;
  /** On-chain availableBalance(USDC, address), in USDC. */
  onChainAvailableUsdc: number;
  /** Circle /v1/balances available figure, in USDC (null if the API is unreachable). */
  apiAvailableUsdc: number | null;
  /** True when there is no Gateway deposit to settle against. */
  needsDeposit: boolean;
}

/**
 * Read the Gateway balance for an address two ways: directly from the
 * GatewayWallet contract (availableBalance) and from Circle's /v1/balances REST
 * endpoint (which also reflects deposit finality and in-flight transfers). The
 * REST read is best-effort: if it fails we still return the on-chain figure.
 */
export async function getGatewayBalance(address: `0x${string}`): Promise<GatewayBalance> {
  const domain = getGatewayDomain();

  let onChainAvailableUsdc = 0;
  try {
    const raw = await gatewayPublicClient.readContract({
      address: GATEWAY_WALLET_ADDRESS,
      abi: GATEWAY_WALLET_ABI,
      functionName: "availableBalance",
      args: [USDC_ADDRESS, address],
    });
    // availableBalance is in the token's atomic units (USDC facade = 6 decimals)
    onChainAvailableUsdc = Number(raw) / 1e6;
  } catch (err: any) {
    console.warn(`[gateway] availableBalance read failed for ${address}: ${err.message}`);
  }

  let apiAvailableUsdc: number | null = null;
  if (domain !== null) {
    try {
      const res = await fetch(`${GATEWAY_API_BASE}/v1/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDC", sources: [{ domain, depositor: address }] }),
      });
      if (res.ok) {
        const data: any = await res.json();
        const entry = (data.balances || []).find((b: any) => b.domain === domain);
        // The API returns a decimal string in USDC (e.g. "1.5").
        if (entry?.balance != null) apiAvailableUsdc = parseFloat(entry.balance);
      } else {
        console.warn(`[gateway] /v1/balances ${res.status} for ${address}`);
      }
    } catch (err: any) {
      console.warn(`[gateway] /v1/balances unreachable for ${address}: ${err.message}`);
    }
  }

  const effective = apiAvailableUsdc != null ? apiAvailableUsdc : onChainAvailableUsdc;
  return {
    address,
    domain,
    onChainAvailableUsdc,
    apiAvailableUsdc,
    needsDeposit: effective <= 0,
  };
}

/**
 * Deposit helper (documented, NOT executed here).
 *
 * Depositing USDC into the GatewayWallet is a one-time on-chain step the
 * operator (or each creator) does once before any batch can settle against
 * their balance. The task forbids the backend from sending on-chain txs, so we
 * return the prepared call instead of broadcasting it. To go live, the operator
 * runs the two steps below from a funded wallet (see docs/gateway.md):
 *
 *   1. USDC.approve(GatewayWallet, value)         // ERC-20 allowance
 *   2. GatewayWallet.deposit(USDC, value)         // moves USDC into Gateway
 *
 * (or a single GatewayWallet.depositWithPermit if the USDC facade supports
 * EIP-2612 permits). depositFor(USDC, depositor, value) lets the operator fund
 * a creator's balance on their behalf.
 */
export interface PreparedDeposit {
  to: `0x${string}`;
  abi: typeof GATEWAY_WALLET_ABI;
  functionName: "deposit";
  args: [`0x${string}`, bigint];
  /** Human note: the ERC-20 approve that must precede the deposit. */
  requiresApproval: { token: `0x${string}`; spender: `0x${string}`; value: bigint };
}

export function prepareDeposit(usdc: number): PreparedDeposit {
  const value = usdcToAtomic(usdc);
  return {
    to: GATEWAY_WALLET_ADDRESS,
    abi: GATEWAY_WALLET_ABI,
    functionName: "deposit",
    args: [USDC_ADDRESS, value],
    requiresApproval: { token: USDC_ADDRESS, spender: GATEWAY_WALLET_ADDRESS, value },
  };
}

// ============================================================
// Batched settlement
// ============================================================

/** What a creator is owed across all of their pending sessions in one batch. */
export interface CreatorBatchPlan {
  /** Creator wallet that receives the settled USDC. */
  payTo: `0x${string}`;
  /** Sessions folded into this creator's batch. */
  sessionIds: string[];
  /** Total owed to this creator, in 6-decimal atomic USDC units. */
  totalAtomic: bigint;
  /** Total owed, in USDC, for logging/receipts. */
  totalUsdc: number;
  /**
   * One /v1/batch/submit body per session. Built faithfully to the Gateway
   * batch API (EIP-3009 single-chain authorization). `auth.eip3009Auth.signature`
   * is left empty: it requires a viewer-side EIP-3009 signature, which the
   * current StreamPay voucher is not. See docs/gateway.md.
   */
  submissions: GatewayBatchSubmission[];
}

export interface GatewayBatchSubmission {
  token: "USDC";
  sendingDomain: number;
  recipientDomain: number;
  auth: {
    eip3009Auth: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: `0x${string}`;
      /** Empty until a real EIP-3009 authorization is produced viewer-side. */
      signature: `0x${string}` | "";
    };
  };
}

export interface BatchSettleResult {
  ok: boolean;
  /** Why the batch did not actually submit (flag off, no deposit, scaffolded). */
  reason?: string;
  /** Per-creator plans that WOULD be submitted. */
  plans: CreatorBatchPlan[];
  /** Total USDC across all creators in this batch. */
  totalUsdc: number;
  /** True only if a real submission was attempted (GATEWAY_LIVE_SUBMIT=1). */
  submitted: boolean;
}

interface PendingForBatch {
  session: IStreamSession;
  /** Creator wallet that should receive this session's owed amount. */
  creatorAddress: `0x${string}`;
}

/**
 * Aggregate a set of pending stream sessions into per-creator Gateway batches
 * and (when fully enabled) submit them. This is the additive alternative to
 * calling closeSession once per session.
 *
 * Safety gates, in order:
 *   1. GATEWAY_BATCHING flag must be on (else this is never reached).
 *   2. The active chain must have a Circle domain (Arc testnet / Base Sepolia).
 *   3. The operator must have a Gateway deposit ("needs deposit" guard) before
 *      any settlement is attempted.
 *   4. Actual network submission only happens with GATEWAY_LIVE_SUBMIT=1 AND a
 *      real EIP-3009 authorization signature present; otherwise we return the
 *      constructed plan (scaffold) without touching the network or chain.
 */
export async function settleBatch(pending: PendingForBatch[]): Promise<BatchSettleResult> {
  const empty: BatchSettleResult = { ok: true, plans: [], totalUsdc: 0, submitted: false };

  if (!isGatewayEnabled()) {
    return { ...empty, ok: false, reason: "GATEWAY_BATCHING disabled" };
  }
  if (pending.length === 0) {
    return empty;
  }

  const domain = getGatewayDomain();
  if (domain === null) {
    return { ...empty, ok: false, reason: `chain ${chainConfig.network} has no Circle domain` };
  }

  // Guard: the operator must have funded the Gateway before we settle anything.
  const operator = getOperatorAccount();
  if (!operator) {
    return { ...empty, ok: false, reason: "no operator key configured" };
  }
  const operatorBalance = await getGatewayBalance(operator.address);
  if (operatorBalance.needsDeposit) {
    return {
      ...empty,
      ok: false,
      reason: `operator ${operator.address} has no Gateway deposit; deposit USDC first`,
    };
  }

  // Group owed amounts by creator and build one EIP-3009 submission per session.
  const byCreator = new Map<string, CreatorBatchPlan>();
  const now = Math.floor(Date.now() / 1000);
  const validBefore = now + 3600; // 1h authorization window

  for (const { session, creatorAddress } of pending) {
    const owedWei = BigInt(session.lastAmountWei || "0");
    if (owedWei <= 0n || !session.lastSig) continue; // nothing to settle

    const owedUsdc = weiToUsdc(owedWei);
    const owedAtomic = usdcToAtomic(owedUsdc);
    if (owedAtomic <= 0n) continue;

    const key = creatorAddress.toLowerCase();
    let plan = byCreator.get(key);
    if (!plan) {
      plan = {
        payTo: creatorAddress,
        sessionIds: [],
        totalAtomic: 0n,
        totalUsdc: 0,
        submissions: [],
      };
      byCreator.set(key, plan);
    }

    plan.sessionIds.push(session.sessionId);
    plan.totalAtomic += owedAtomic;
    plan.totalUsdc += owedUsdc;
    plan.submissions.push({
      token: "USDC",
      sendingDomain: domain,
      recipientDomain: domain, // single-chain settlement on Arc
      auth: {
        eip3009Auth: {
          from: session.viewerAddress as `0x${string}`,
          to: creatorAddress,
          value: owedAtomic.toString(),
          validAfter: "0",
          validBefore: validBefore.toString(),
          // Per-session unique nonce derived from the on-chain session id.
          nonce: sessionNonce(session.sessionId),
          // Empty: needs a viewer-side EIP-3009 signature (see docs/gateway.md).
          signature: "",
        },
      },
    });
  }

  const plans = [...byCreator.values()];
  const totalUsdc = plans.reduce((sum, p) => sum + p.totalUsdc, 0);

  // Scaffold boundary: only cross the network if explicitly enabled AND every
  // submission carries a real authorization signature. We never send otherwise.
  const liveSubmit = (process.env.GATEWAY_LIVE_SUBMIT || "").trim() === "1";
  const allSigned = plans.every((p) => p.submissions.every((s) => s.auth.eip3009Auth.signature));

  if (!liveSubmit) {
    return { ok: true, plans, totalUsdc, submitted: false, reason: "scaffold: GATEWAY_LIVE_SUBMIT unset" };
  }
  if (!allSigned) {
    return {
      ok: true,
      plans,
      totalUsdc,
      submitted: false,
      reason: "scaffold: EIP-3009 authorizations not yet produced viewer-side",
    };
  }

  // Live path (only reachable once viewer-side EIP-3009 signing lands): POST
  // each authorization to Circle's batch API. Circle locks the sender balance,
  // queues the tx, and settles the batch on-chain via its forwarder.
  for (const plan of plans) {
    for (const submission of plan.submissions) {
      const res = await fetch(`${GATEWAY_API_BASE}/v1/batch/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`/v1/batch/submit ${res.status} for creator ${plan.payTo}: ${text}`);
      }
    }
  }

  return { ok: true, plans, totalUsdc, submitted: true };
}

/** Deterministic 32-byte nonce for a session so a batch cannot double-submit it. */
function sessionNonce(sessionId: string): `0x${string}` {
  const hex = BigInt(sessionId).toString(16).padStart(64, "0");
  return `0x${hex}`;
}
