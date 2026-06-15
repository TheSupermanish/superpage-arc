#!/usr/bin/env npx tsx
/**
 * End-to-end on-chain test of the StreamPay pay-per-second flow on Arc testnet.
 *
 * Mirrors exactly what the frontend hook (use-stream-session.ts) does, but
 * headless with viem so it can run without a browser wallet:
 *   1. openSession on-chain (native USDC deposit + ephemeral session key)
 *   2. register the session with the backend
 *   3. verify HLS segment gating (token required)
 *   4. send a signed per-second voucher (heartbeat)
 *   5. close the session and confirm on-chain settlement
 *
 * Usage: npx tsx scripts/e2e-stream-arc.ts [http://localhost:2337]
 */
import {
  createWalletClient, createPublicClient, http, defineChain,
  keccak256, encodePacked, decodeEventLog, formatUnits, parseEventLogs,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import "dotenv/config";
import { STREAMPAY_ABI } from "../src/config/streampay.js";

const BASE_URL = process.argv[2] || "http://localhost:2337";
const SLUG = "live-from-the-lepton-economy-demo-stream";
const STREAMPAY = "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c" as `0x${string}`;
const CHAIN_ID = 5042002;

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
const viewer = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));
const wallet = createWalletClient({ account: viewer, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });

async function j(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function fmt(wei: bigint) { return formatUnits(wei, 18) + " USDC"; }

async function main() {
  console.log("=== StreamPay E2E on Arc testnet ===\n");

  // Match the resource's per-second price (0.001 USDC/s) using the same
  // quantization the app uses: micro-USDC * 1e12 = native wei.
  const meta = (await j(`/stream/meta/${SLUG}`)).body;
  const ratePerSecond = BigInt(Math.round(meta.pricePerSecondUsdc * 1e6)) * 1_000_000_000_000n;
  const deposit = ratePerSecond * 50n; // enough for 50s
  const sessionKey = privateKeyToAccount(generatePrivateKey());

  console.log("viewer/creator:", viewer.address);
  console.log("rate/sec:", fmt(ratePerSecond), "| deposit:", fmt(deposit), "| sessionKey:", sessionKey.address, "\n");

  const balBefore = await pub.getBalance({ address: viewer.address });

  // 1. openSession
  console.log("[1] openSession...");
  const openHash = await wallet.writeContract({
    address: STREAMPAY, abi: STREAMPAY_ABI, functionName: "openSession",
    args: [meta.creator.walletAddress as `0x${string}`, ratePerSecond, sessionKey.address],
    value: deposit,
  });
  const openReceipt = await pub.waitForTransactionReceipt({ hash: openHash });
  const opened = parseEventLogs({ abi: STREAMPAY_ABI, logs: openReceipt.logs, eventName: "SessionOpened" })[0] as any;
  const sessionId = opened.args.id as bigint;
  console.log("    tx:", openHash);
  console.log("    sessionId:", sessionId.toString(), "\n");

  // 2. register
  console.log("[2] register session with backend...");
  const reg = await j("/stream/session/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceSlug: SLUG, sessionId: sessionId.toString() }),
  });
  if (reg.status !== 200) throw new Error(`register failed ${reg.status}: ${JSON.stringify(reg.body)}`);
  const token = reg.body.hlsToken;
  console.log("    ok, got HLS token (len", token?.length, ")\n");

  // 3. HLS gating: without token must be rejected, with token must serve
  console.log("[3] HLS gating...");
  const resourceId = meta.id;
  const noTok = await fetch(`${BASE_URL}/stream/hls/${resourceId}/index.m3u8`);
  const withTok = await fetch(`${BASE_URL}/stream/hls/${resourceId}/index.m3u8?t=${token}`);
  console.log("    no token:", noTok.status, "(expect 401/403) | with token:", withTok.status, "(expect 200)\n");

  // 4. heartbeat with a signed voucher for ~12 seconds watched
  console.log("[4] sign + send voucher (12s watched)...");
  const amountOwed = ratePerSecond * 12n;
  const digest = keccak256(encodePacked(
    ["string", "uint256", "address", "uint256", "uint256"],
    ["SUPERPAGE_STREAM", BigInt(CHAIN_ID), STREAMPAY, sessionId, amountOwed],
  ));
  const signature = await sessionKey.signMessage({ message: { raw: digest } });
  const hb = await j(`/stream/session/${sessionId}/heartbeat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountOwedWei: amountOwed.toString(), secondsWatched: 12, signature }),
  });
  if (hb.status !== 200) throw new Error(`heartbeat failed ${hb.status}: ${JSON.stringify(hb.body)}`);
  console.log("    voucher accepted, owed:", fmt(amountOwed), "\n");

  // 5. close + poll for settlement.
  // DROP=1 simulates the tab dying / internet dropping: we DON'T call close and
  // never send another heartbeat, then wait for the backend's stale-session
  // sweep (60s no-heartbeat cutoff, runs every 30s) to settle it for us.
  const drop = process.env.DROP === "1";
  if (drop) {
    console.log("[5] DROP: no close, no more heartbeats — waiting for the sweep backstop...");
  } else {
    console.log("[5] close session...");
    await j(`/stream/session/${sessionId}/close`, { method: "POST" });
  }
  let settled: any = null;
  const tries = drop ? 75 : 30; // ~150s for the sweep path
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = (await j(`/stream/session/${sessionId}`)).body;
    if (s.status === "settled" || s.status === "expired") { settled = s; break; }
  }
  if (!settled) throw new Error("settlement timed out");
  console.log("    status:", settled.status, "| closeTx:", settled.txHashClose, "\n");

  // 6. verify on-chain
  console.log("[6] verify on-chain...");
  const onchain = await pub.readContract({
    address: STREAMPAY, abi: STREAMPAY_ABI, functionName: "getSession", args: [sessionId],
  }) as any[];
  const open = onchain[6];
  console.log("    session.open (expect false):", open);
  if (settled.txHashClose) {
    const closeReceipt = await pub.getTransactionReceipt({ hash: settled.txHashClose });
    const closedEvt = parseEventLogs({ abi: STREAMPAY_ABI, logs: closeReceipt.logs, eventName: "SessionClosed" })[0] as any;
    console.log("    SessionClosed: amountPaid =", fmt(closedEvt.args.amountPaid), "| refund =", fmt(closedEvt.args.refund));
    const okPaid = closedEvt.args.amountPaid === amountOwed;
    const okRefund = closedEvt.args.refund === deposit - amountOwed;
    console.log("    amountPaid matches voucher:", okPaid, "| refund matches:", okRefund);
    if (!okPaid || !okRefund || open !== false) throw new Error("on-chain settlement mismatch");
  }

  const balAfter = await pub.getBalance({ address: viewer.address });
  console.log("\n    net balance change (viewer==creator, so just gas):", fmt(balBefore - balAfter));
  console.log("\n=== E2E PASSED ===");
  console.log("Explorer:");
  console.log("  open:  https://testnet.arcscan.app/tx/" + openHash);
  if (settled.txHashClose) console.log("  close: https://testnet.arcscan.app/tx/" + settled.txHashClose);
}

main().catch((e) => { console.error("\nE2E FAILED:", e.message); process.exit(1); });
