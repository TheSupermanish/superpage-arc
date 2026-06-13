#!/usr/bin/env npx tsx
/**
 * End-to-end on-chain test of the x402 article purchase flow on Arc testnet.
 *
 *   1. GET the resource unpaid -> 402 with payment requirements
 *   2. Pay: ERC-20 transfer of USDC (6-decimal facade) to the recipient
 *   3. Retry with X-PAYMENT proof -> 200 + full article content
 *
 * Usage: npx tsx scripts/e2e-article-arc.ts [http://localhost:2337] [slug]
 */
import { createWalletClient, createPublicClient, http, defineChain, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const BASE_URL = process.argv[2] || "http://localhost:2337";
const SLUG = process.argv[3] || "arc-in-five-minutes-usdc-as-gas";
const USDC_FACADE = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const CHAIN_ID = 5042002;

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
const buyer = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));
const wallet = createWalletClient({ account: buyer, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });
const ERC20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

async function main() {
  console.log("=== x402 article purchase E2E on Arc testnet ===\n");
  console.log("buyer:", buyer.address, "\n");

  // 1. unpaid request -> 402
  console.log("[1] GET resource unpaid...");
  const r1 = await fetch(`${BASE_URL}/x402/resource/${SLUG}`);
  if (r1.status !== 402) throw new Error(`expected 402, got ${r1.status}`);
  const req = await r1.json();
  const reqs = req.accepts?.[0] || req;
  console.log("    402:", reqs.priceFormatted || `${reqs.amount} units`, "to", reqs.recipient, "token", reqs.token, "\n");

  // 2. pay: ERC-20 transfer on the USDC facade (6 decimals)
  console.log("[2] pay via ERC-20 transfer (facade, 6 dec)...");
  const hash = await wallet.writeContract({
    address: USDC_FACADE, abi: ERC20, functionName: "transfer",
    args: [reqs.recipient as `0x${string}`, BigInt(reqs.amount)],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("    tx:", hash, "| status:", receipt.status, "\n");

  // 3. retry with proof
  console.log("[3] retry with X-PAYMENT proof...");
  const r2 = await fetch(`${BASE_URL}/x402/resource/${SLUG}`, {
    headers: {
      "X-PAYMENT": JSON.stringify({
        transactionHash: hash, network: "arc-testnet", chainId: CHAIN_ID, timestamp: Math.floor(Date.now() / 1000),
      }),
    },
  });
  console.log("    status:", r2.status);
  if (r2.status !== 200) {
    const errBody = await r2.text();
    throw new Error(`unlock failed ${r2.status}: ${errBody.slice(0, 300)}`);
  }
  const content = await r2.json();
  const md = content.markdown || content.content || "";
  console.log("    type:", content.type, "| blocks:", Array.isArray(content.blocks) ? content.blocks.length : "none",
    "| markdown chars:", md.length);
  console.log("    first line:", md.split("\n")[0]);

  console.log("\n=== ARTICLE E2E PASSED ===");
  console.log("Explorer: https://testnet.arcscan.app/tx/" + hash);
}

main().catch((e) => { console.error("\nARTICLE E2E FAILED:", e.message); process.exit(1); });
