#!/usr/bin/env npx tsx
/**
 * One-time operator step: deposit USDC into Circle's GatewayWallet so the
 * Gateway settlement strategy has a balance to pay creators from.
 *
 * Usage: npx tsx scripts/gateway-deposit.ts [amountUsdc]   (default 1)
 */
import "dotenv/config";
import { executeDeposit, getGatewayOperator } from "../src/services/gateway-transfer.js";
import { getGatewayBalance } from "../src/services/gateway-settlement.js";

const amount = Number(process.argv[2] || "1");

async function main() {
  const op = getGatewayOperator();
  if (!op) throw new Error("WALLET_PRIVATE_KEY required");
  console.log(`Depositing ${amount} USDC into Circle Gateway for ${op.address}...`);

  const { approveTx, depositTx } = await executeDeposit(amount);
  if (approveTx) console.log("  approve:", approveTx);
  console.log("  deposit:", depositTx);

  // Poll until Circle credits the deposit.
  process.stdout.write("  waiting for Circle to credit");
  for (let i = 0; i < 30; i++) {
    const bal = await getGatewayBalance(op.address);
    if ((bal.apiAvailableUsdc ?? bal.onChainAvailableUsdc) >= amount) {
      console.log(`\n  gateway balance: ${bal.apiAvailableUsdc ?? bal.onChainAvailableUsdc} USDC`);
      console.log("Done. Set GATEWAY_BATCHING=1 and GATEWAY_LIVE_SUBMIT=1 to settle via Gateway.");
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log("\n  (deposit sent; balance not yet credited — check again shortly)");
}

main().catch((e) => {
  console.error("gateway-deposit failed:", e.message);
  process.exit(1);
});
