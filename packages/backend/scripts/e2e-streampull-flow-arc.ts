#!/usr/bin/env npx tsx
/**
 * End-to-end test of the no-deposit streaming flow THROUGH THE BACKEND on Arc —
 * exactly what the frontend hook will do, headless:
 *   1. approve a cap to StreamPayPull (USDC stays in the wallet)
 *   2. openSession on-chain (no value) with an ephemeral session key
 *   3. register the session with the backend
 *   4. send a signed 6-decimal voucher (heartbeat)
 *   5. close -> backend settles by pulling the owed amount via transferFrom
 *
 * Verifies the whole backend cutover (routes + settlement strategy + units).
 * Usage: npx tsx scripts/e2e-streampull-flow-arc.ts
 */
import {
  createWalletClient, createPublicClient, http, defineChain,
  keccak256, encodePacked, parseAbi, parseEventLogs,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dep = JSON.parse(readFileSync(resolve(__dirname, "../src/config/streampull-deployment.json"), "utf-8"));
const STREAMPULL = dep.address as `0x${string}`;
const ABI = dep.abi;
const USDC = (dep.usdc || "0x3600000000000000000000000000000000000000") as `0x${string}`;
const BASE_URL = process.argv[2] || "http://localhost:2337";
const SLUG = "live-from-the-lepton-economy-demo-stream";
const CHAIN_ID = 5042002;

const arc = defineChain({
  id: CHAIN_ID, name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
});

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
if (!RAW) throw new Error("WALLET_PRIVATE_KEY required");
const viewer = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));
const wallet = createWalletClient({ account: viewer, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });
const ERC20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

async function j(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const usdc = (n: bigint) => (Number(n) / 1e6).toFixed(6) + " USDC";

async function main() {
  console.log("=== StreamPayPull full backend flow E2E on Arc ===\n");
  const meta = (await j(`/stream/meta/${SLUG}`)).body;
  const rate = BigInt(Math.round(meta.pricePerSecondUsdc * 1e6)); // 6-dec units/s
  const cap = rate * 50n;   // approve enough for 50s
  const owed = rate * 12n;  // 12s watched
  const sessionKey = privateKeyToAccount(generatePrivateKey());
  console.log("viewer:", viewer.address, "| rate:", usdc(rate), "/s | cap:", usdc(cap), "\n");

  // 1. approve cap (only if needed — this is the reusable "credit")
  const allowance = (await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [viewer.address, STREAMPULL] })) as bigint;
  if (allowance < cap) {
    console.log("[1] approve cap...");
    const a = await wallet.writeContract({ address: USDC, abi: ERC20, functionName: "approve", args: [STREAMPULL, cap] });
    await pub.waitForTransactionReceipt({ hash: a });
    console.log("    approved:", a);
  } else {
    console.log("[1] allowance already covers cap (reused credit), skipping approve");
  }

  // 2. openSession (no value)
  console.log("\n[2] openSession (no deposit)...");
  const oHash = await wallet.writeContract({
    address: STREAMPULL, abi: ABI, functionName: "openSession",
    args: [meta.creator.walletAddress as `0x${string}`, rate, sessionKey.address, cap],
  });
  const oRcpt = await pub.waitForTransactionReceipt({ hash: oHash });
  const sessionId = (parseEventLogs({ abi: ABI, logs: oRcpt.logs, eventName: "SessionOpened" })[0] as any).args.id as bigint;
  console.log("    sessionId:", sessionId.toString());

  // 3. register with backend
  console.log("\n[3] register with backend...");
  const reg = await j("/stream/session/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceSlug: SLUG, sessionId: sessionId.toString() }),
  });
  if (reg.status !== 200) throw new Error(`register failed ${reg.status}: ${JSON.stringify(reg.body)}`);
  console.log("    ok, HLS token len:", reg.body.hlsToken?.length);

  // 4. signed 6-dec voucher
  console.log("\n[4] heartbeat with 6-dec voucher (", usdc(owed), ")...");
  const digest = keccak256(encodePacked(
    ["string", "uint256", "address", "uint256", "uint256"],
    ["SUPERPAGE_STREAM", BigInt(CHAIN_ID), STREAMPULL, sessionId, owed],
  ));
  const signature = await sessionKey.signMessage({ message: { raw: digest } });
  const hb = await j(`/stream/session/${sessionId}/heartbeat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountOwedWei: owed.toString(), secondsWatched: 12, signature }),
  });
  if (hb.status !== 200) throw new Error(`heartbeat failed ${hb.status}: ${JSON.stringify(hb.body)}`);
  console.log("    voucher accepted");

  // 5. close -> backend pulls via transferFrom
  console.log("\n[5] close -> backend settles by pull...");
  await j(`/stream/session/${sessionId}/close`, { method: "POST" });
  let settled: any = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = (await j(`/stream/session/${sessionId}`)).body;
    if (s.status === "settled" || s.status === "expired") { settled = s; break; }
  }
  if (!settled) throw new Error("settlement timed out");
  console.log("    status:", settled.status, "| closeTx:", settled.txHashClose);

  // 6. verify on-chain: session closed + SessionClosed amountPaid == owed
  const onchain = (await pub.readContract({ address: STREAMPULL, abi: ABI, functionName: "getSession", args: [sessionId] })) as any[];
  console.log("    session.open (expect false):", onchain[6]);
  if (settled.txHashClose) {
    const rcpt = await pub.getTransactionReceipt({ hash: settled.txHashClose });
    const ev = parseEventLogs({ abi: ABI, logs: rcpt.logs, eventName: "SessionClosed" })[0] as any;
    console.log("    SessionClosed amountPaid:", usdc(ev.args.amountPaid));
    if (ev.args.amountPaid !== owed) throw new Error("amountPaid mismatch");
    if (onchain[6] !== false) throw new Error("session still open");
  } else {
    throw new Error("no close tx — settlement did not pull");
  }

  console.log("\n=== STREAMPULL BACKEND FLOW E2E PASSED ===");
  console.log("close: https://testnet.arcscan.app/tx/" + settled.txHashClose);
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
