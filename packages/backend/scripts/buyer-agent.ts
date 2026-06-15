#!/usr/bin/env npx tsx
/**
 * Autonomous buyer agent.
 *
 * Runs the full agent-commerce loop against a live SuperPage backend, on Arc:
 *   1. DISCOVER  — GET /api/market/discover (the agent-facing catalog)
 *   2. PAY       — for each chosen item, read its 402, transfer USDC on Arc,
 *                  retry with an X-PAYMENT proof, and unlock the content
 *   3. REVIEW    — leave on-chain ERC-8004 feedback for the creator's agent
 *                  (skipped when the buyer would be reviewing itself)
 *
 * This produces real on-chain traction (USDC payments + reputation writes) and
 * exercises discovery, x402, and ERC-8004 end to end with one process.
 *
 * Env:
 *   WALLET_PRIVATE_KEY  buyer key (required)
 *   BUYER_MAX_PRICE     max USDC per item (default 0.05)
 *   BUYER_BUY_COUNT     how many items to buy this run (default 1)
 *   BUYER_QUERY         optional intent keyword passed to discovery
 *   BUYER_FEEDBACK      "1" to leave on-chain feedback (default off)
 *   BUYER_DRY_RUN       "1" to plan without sending any transaction
 *
 * Usage: npx tsx scripts/buyer-agent.ts [http://localhost:2337]
 */
import { createWalletClient, createPublicClient, http, defineChain, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";
import { giveFeedback, getAgentInfo } from "../src/erc8004/index.js";

const BASE_URL = process.argv[2] || process.env.BUYER_BASE_URL || "http://localhost:2337";
const USDC_FACADE = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const CHAIN_ID = 5042002;
const MAX_PRICE = Number(process.env.BUYER_MAX_PRICE || "0.05");
const BUY_COUNT = Math.max(1, Number(process.env.BUYER_BUY_COUNT || "1"));
const QUERY = process.env.BUYER_QUERY || "";
const LEAVE_FEEDBACK = process.env.BUYER_FEEDBACK === "1";
const DRY_RUN = process.env.BUYER_DRY_RUN === "1";

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
if (!RAW) throw new Error("WALLET_PRIVATE_KEY is required");
const buyer = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));
const wallet = createWalletClient({ account: buyer, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });
const ERC20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

const txUrl = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

interface CatalogItem {
  id: string;
  slug: string | null;
  type: string;
  name: string;
  priceUsdc: number;
  paymentUrl: string;
  creator: { username: string | null; agentId: number | null };
}

async function discover(): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ maxPrice: String(MAX_PRICE), limit: "40" });
  if (QUERY) params.set("q", QUERY);
  const res = await fetch(`${BASE_URL}/api/market/discover?${params.toString()}`);
  if (!res.ok) throw new Error(`discover failed: ${res.status}`);
  const data = (await res.json()) as { items?: CatalogItem[] };
  // Buyable now: priced (not free), and not a stream (video uses the channel flow).
  return (data.items || []).filter((i) => i.priceUsdc > 0 && i.type !== "video");
}

/** Pay an item via x402 on Arc and unlock it. Returns the payment tx hash. */
async function buy(item: CatalogItem): Promise<string> {
  const r1 = await fetch(`${BASE_URL}${item.paymentUrl}`);
  if (r1.status !== 402) throw new Error(`expected 402, got ${r1.status}`);
  const body = await r1.json();
  const arcReq = (body.accepts || []).find((a: any) => a.chainId === CHAIN_ID) || body;
  console.log(`    402: ${arcReq.priceFormatted || arcReq.amount} → ${arcReq.recipient}`);

  if (DRY_RUN) {
    console.log("    [dry-run] would transfer and unlock");
    return "0xDRYRUN";
  }

  const hash = await wallet.writeContract({
    address: USDC_FACADE,
    abi: ERC20,
    functionName: "transfer",
    args: [arcReq.recipient as `0x${string}`, BigInt(arcReq.amount)],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`    paid: ${hash} (${receipt.status})`);

  const r2 = await fetch(`${BASE_URL}${item.paymentUrl}`, {
    headers: {
      "X-PAYMENT": JSON.stringify({
        transactionHash: hash,
        network: "arc-testnet",
        chainId: CHAIN_ID,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    },
  });
  if (r2.status !== 200) {
    throw new Error(`unlock failed ${r2.status}: ${(await r2.text()).slice(0, 200)}`);
  }
  console.log(`    unlocked ✓ (${item.type})`);
  return hash;
}

/** Leave on-chain feedback for the creator's agent, unless that's a self-review. */
async function review(item: CatalogItem): Promise<void> {
  const agentId = item.creator.agentId;
  if (!agentId) {
    console.log("    review: skipped (creator has no on-chain agent)");
    return;
  }
  if (!LEAVE_FEEDBACK) {
    console.log(`    review: capable (agent #${agentId}) — set BUYER_FEEDBACK=1 to enable`);
    return;
  }
  try {
    const info = await getAgentInfo(BigInt(agentId));
    if (info.owner.toLowerCase() === buyer.address.toLowerCase()) {
      console.log(`    review: skipped (agent #${agentId} is owned by the buyer — no self-reviews)`);
      return;
    }
    if (DRY_RUN) {
      console.log(`    [dry-run] would rate agent #${agentId} 90/100`);
      return;
    }
    const hash = await giveFeedback({
      agentId: BigInt(agentId),
      value: 90,
      valueDecimals: 0,
      tag1: "quality",
      tag2: "purchase",
      endpoint: item.paymentUrl,
      feedbackURI: `${BASE_URL}${item.paymentUrl}`,
    });
    console.log(`    reviewed agent #${agentId}: ${hash}`);
  } catch (err: any) {
    console.log(`    review: skipped (${err.message?.slice(0, 80)})`);
  }
}

async function main() {
  console.log("=== SuperPage autonomous buyer agent ===");
  console.log(`buyer: ${buyer.address}`);
  console.log(`backend: ${BASE_URL} | maxPrice: $${MAX_PRICE} | count: ${BUY_COUNT}${DRY_RUN ? " | DRY-RUN" : ""}\n`);

  console.log("[1] discover…");
  const candidates = await discover();
  console.log(`    ${candidates.length} buyable item(s) under $${MAX_PRICE}`);
  const picks = candidates.slice(0, BUY_COUNT);
  if (picks.length === 0) {
    console.log("\nnothing to buy. done.");
    return;
  }

  const receipts: Array<{ name: string; price: number; hash: string }> = [];
  for (const item of picks) {
    console.log(`\n[2] buy "${item.name}" ($${item.priceUsdc}) from @${item.creator.username ?? "?"}`);
    const hash = await buy(item);
    await review(item);
    receipts.push({ name: item.name, price: item.priceUsdc, hash });
  }

  const total = receipts.reduce((s, r) => s + r.price, 0);
  console.log(`\n=== bought ${receipts.length} item(s), ~$${total.toFixed(4)} USDC ===`);
  for (const r of receipts) {
    console.log(`  • ${r.name}${r.hash !== "0xDRYRUN" ? `  ${txUrl(r.hash)}` : ""}`);
  }
}

main().catch((e) => {
  console.error("\nBUYER AGENT FAILED:", e.message);
  process.exit(1);
});
