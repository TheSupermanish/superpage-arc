#!/usr/bin/env npx tsx
/**
 * Prove the Gateway BATCH settlement path: several stream payouts settled
 * through Circle Gateway from one operator deposit, submitted as a single
 * /v1/transfer batch and minted on-chain. This is settleBatch() (the gateway
 * settlement strategy's engine) exercised live.
 *
 * Forces GATEWAY_BATCHING=1 and GATEWAY_LIVE_SUBMIT=1. Requires the operator to
 * already have a Gateway deposit (run e2e-gateway-arc.ts once first).
 *
 * Usage: npx tsx scripts/e2e-gateway-batch.ts
 */
process.env.GATEWAY_BATCHING = "1";
process.env.GATEWAY_LIVE_SUBMIT = "1";

import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { settleBatch } from "../src/services/gateway-settlement.js";

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
if (!RAW) throw new Error("WALLET_PRIVATE_KEY required");
const op = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));

// 18-decimal native-USDC wei for a small owed amount (matches StreamPay vouchers).
const usdcToWei = (usdc: number) => BigInt(Math.round(usdc * 1e6)) * 1_000_000_000_000n;

// Two synthetic pending sessions owing the operator (round-trip, no funds lost).
function fakeSession(id: string, owedUsdc: number): any {
  return {
    sessionId: id,
    resourceId: "000000000000000000000000",
    viewerAddress: op.address,
    lastAmountWei: usdcToWei(owedUsdc).toString(),
    lastSig: "0x" + "11".repeat(65), // presence-only; gateway path doesn't use it
  };
}

async function main() {
  console.log("=== Gateway BATCH settlement E2E on Arc ===\n");
  console.log("operator:", op.address);

  const pending = [
    { session: fakeSession("9000001", 0.02), creatorAddress: op.address },
    { session: fakeSession("9000002", 0.03), creatorAddress: op.address },
  ];
  console.log(`settling ${pending.length} payouts via Circle Gateway (0.02 + 0.03 USDC)...\n`);

  const result = await settleBatch(pending);

  console.log("submitted:", result.submitted);
  console.log("reason:", result.reason || "(settled)");
  console.log("totalUsdc:", result.totalUsdc);
  for (const p of result.plans) {
    console.log(`  payout ${p.totalUsdc} USDC -> ${p.payTo}`);
    for (const tx of p.mintTxs || []) console.log(`    mint: https://testnet.arcscan.app/tx/${tx}`);
  }

  if (!result.submitted) throw new Error(`batch did not submit: ${result.reason}`);
  if (!result.plans.every((p) => (p.mintTxs || []).length > 0)) throw new Error("missing mint txs");

  console.log("\n=== GATEWAY BATCH E2E PASSED ===");
}

main().catch((e) => {
  console.error("\nGATEWAY BATCH E2E FAILED:", e.message);
  process.exit(1);
});
