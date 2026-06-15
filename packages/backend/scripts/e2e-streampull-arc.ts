#!/usr/bin/env npx tsx
/**
 * On-chain proof of the no-deposit approval/pull streaming model on Arc.
 *
 *   1. viewer approves a cap to StreamPayPull (USDC stays in their wallet)
 *   2. openSession (no funds move) with an ephemeral session key
 *   3. session key signs a voucher for the owed amount (gasless)
 *   4. closeSession verifies the voucher and PULLS exactly the owed amount
 *      from the viewer to the creator via transferFrom — no deposit, no refund
 *
 * Uses a fresh random creator so the USDC visibly moves to a different address.
 *
 * Usage: npx tsx scripts/e2e-streampull-arc.ts
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
const dep = JSON.parse(
  readFileSync(resolve(__dirname, "../src/config/streampull-deployment.json"), "utf-8")
);
const STREAMPULL = dep.address as `0x${string}`;
const ABI = dep.abi;
const USDC = (dep.usdc || "0x3600000000000000000000000000000000000000") as `0x${string}`;
const CHAIN_ID = 5042002;

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
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
  "function balanceOf(address) view returns (uint256)",
]);

const usdc = (n: bigint) => (Number(n) / 1e6).toFixed(6) + " USDC";

async function main() {
  console.log("=== StreamPayPull (approval/pull, no deposit) E2E on Arc ===\n");
  console.log("contract:", STREAMPULL);
  console.log("viewer:", viewer.address);

  // Distinct creator so we can see the USDC actually move.
  const creator = privateKeyToAccount(generatePrivateKey()).address;
  const sessionKey = privateKeyToAccount(generatePrivateKey());
  const ratePerSecond = 1000n; // 0.001 USDC/s in 6-dec units
  const cap = 50000n; // 0.05 USDC max for this session
  const owed = 12000n; // 12s watched = 0.012 USDC

  console.log("creator:", creator, "| cap:", usdc(cap), "| owed:", usdc(owed), "\n");

  // 1. approve the cap (USDC stays in the viewer's wallet)
  console.log("[1] approve cap to StreamPayPull...");
  const aHash = await wallet.writeContract({
    address: USDC, abi: ERC20, functionName: "approve", args: [STREAMPULL, cap],
  });
  await pub.waitForTransactionReceipt({ hash: aHash });
  console.log("    approved:", aHash);

  // 2. openSession (no value)
  console.log("\n[2] openSession (no deposit)...");
  const oHash = await wallet.writeContract({
    address: STREAMPULL, abi: ABI, functionName: "openSession",
    args: [creator, ratePerSecond, sessionKey.address, cap],
  });
  const oRcpt = await pub.waitForTransactionReceipt({ hash: oHash });
  const opened = parseEventLogs({ abi: ABI, logs: oRcpt.logs, eventName: "SessionOpened" })[0] as any;
  const sessionId = opened.args.id as bigint;
  console.log("    tx:", oHash, "| sessionId:", sessionId.toString());

  // 3. session key signs the voucher (gasless, off-chain)
  console.log("\n[3] session key signs voucher for", usdc(owed), "...");
  const digest = keccak256(encodePacked(
    ["string", "uint256", "address", "uint256", "uint256"],
    ["SUPERPAGE_STREAM", BigInt(CHAIN_ID), STREAMPULL, sessionId, owed],
  ));
  const sig = await sessionKey.signMessage({ message: { raw: digest } });

  // 4. closeSession pulls the owed amount via transferFrom
  console.log("\n[4] closeSession -> transferFrom pull...");
  const creatorBefore = (await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [creator] })) as bigint;
  const viewerBefore = (await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [viewer.address] })) as bigint;

  const cHash = await wallet.writeContract({
    address: STREAMPULL, abi: ABI, functionName: "closeSession", args: [sessionId, owed, sig],
  });
  const cRcpt = await pub.waitForTransactionReceipt({ hash: cHash });
  const closed = parseEventLogs({ abi: ABI, logs: cRcpt.logs, eventName: "SessionClosed" })[0] as any;

  const creatorAfter = (await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [creator] })) as bigint;
  const viewerAfter = (await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [viewer.address] })) as bigint;
  const allowanceAfter = (await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [viewer.address, STREAMPULL] })) as bigint;

  console.log("    tx:", cHash);
  console.log("    SessionClosed amountPaid:", usdc(closed.args.amountPaid));
  console.log("    creator received:", usdc(creatorAfter - creatorBefore));
  console.log("    viewer paid:", usdc(viewerBefore - viewerAfter), "(no deposit, no refund)");
  console.log("    leftover allowance:", usdc(allowanceAfter), "(unused cap stays as approval, not locked)");

  if (creatorAfter - creatorBefore !== owed) throw new Error("creator did not receive the owed amount");
  if (closed.args.amountPaid !== owed) throw new Error("amountPaid mismatch");

  console.log("\n=== STREAMPULL E2E PASSED ===");
  console.log("No deposit was ever held; the creator was paid exactly the voucher amount by pull.");
  console.log("close: https://testnet.arcscan.app/tx/" + cHash);
}

main().catch((e) => { console.error("\nSTREAMPULL E2E FAILED:", e.message); process.exit(1); });
