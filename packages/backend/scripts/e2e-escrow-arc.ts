#!/usr/bin/env npx tsx
/**
 * End-to-end on-chain test of validation-gated escrow on Arc testnet.
 *
 *   1. Seller-agent requests validation from a validator (ERC-8004 registry)
 *   2. Buyer opens escrow bound to that request + the seller's agent
 *   3. Assert release() reverts while validation is pending (the gate works)
 *   4. Validator records a passing response on the registry
 *   5. Anyone calls release() -> contract verifies the on-chain validation and
 *      pays the seller
 *
 * Single-wallet demo: buyer == seller == validator == agent owner (the platform
 * wallet). Funds still move buyer -> escrow contract -> seller for real.
 *
 * Usage: npx tsx scripts/e2e-escrow-arc.ts
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  keccak256,
  toHex,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";
import {
  requestValidation,
  respondToValidation,
  getValidationStatus,
} from "../src/erc8004/index.js";
import { ESCROW_ADDRESS, ESCROW_ABI, isEscrowDeployed, usdcToWei, weiToUsdc } from "../src/config/escrow.js";

const CHAIN_ID = 5042002;
const AGENT_ID = BigInt(process.env.ESCROW_DEMO_AGENT_ID || "1"); // seller's ERC-8004 agent
const AMOUNT_USDC = Number(process.env.ESCROW_DEMO_AMOUNT || "0.02");

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
if (!RAW) throw new Error("WALLET_PRIVATE_KEY required");
const acct = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));
const wallet = createWalletClient({ account: acct, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });

const txUrl = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

async function main() {
  console.log("=== validation-gated escrow E2E on Arc ===\n");
  if (!isEscrowDeployed()) throw new Error("ValidationEscrow not deployed (run deploy-arc-escrow.ts)");
  console.log("escrow:", ESCROW_ADDRESS);
  console.log("buyer/seller/validator:", acct.address, "\n");

  // Unique request per run so prior validations never satisfy this escrow.
  const nonce = `${Date.now()}-${AGENT_ID}`;
  const requestURI = `superpage://commission/${nonce}`;
  const requestHash = keccak256(toHex(requestURI));
  console.log("requestHash:", requestHash);

  // 1. seller-agent requests validation from the validator
  console.log("\n[1] requestValidation (agent owner -> validator)...");
  const t1 = await requestValidation(acct.address, AGENT_ID, requestURI, requestHash);
  await pub.waitForTransactionReceipt({ hash: t1 });
  console.log("    tx:", t1);

  // 2. buyer opens escrow bound to the request + seller agent
  console.log(`\n[2] open escrow ($${AMOUNT_USDC} for agent #${AGENT_ID})...`);
  const refundAfter = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const t2 = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "open",
    args: [acct.address, AGENT_ID, acct.address /* trusted validator */, requestHash, refundAfter],
    value: usdcToWei(AMOUNT_USDC),
  });
  await pub.waitForTransactionReceipt({ hash: t2 });
  const escrowId = (await pub.readContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "lastId",
  })) as bigint;
  console.log("    tx:", t2, "| escrowId:", escrowId.toString());

  const balAfterOpen = await pub.getBalance({ address: ESCROW_ADDRESS });
  console.log("    escrow contract balance:", formatUnits(balAfterOpen, 18), "USDC");

  // 3. assert release reverts before validation (the gate)
  console.log("\n[3] release before validation should REVERT...");
  try {
    await pub.simulateContract({
      address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "release", args: [escrowId], account: acct,
    });
    throw new Error("UNEXPECTED: release succeeded before validation");
  } catch (err: any) {
    const msg = err.shortMessage || err.message || "";
    if (msg.includes("UNEXPECTED")) throw err;
    console.log("    reverted as expected:", (msg.match(/Escrow: [^"\n]+/)?.[0]) || "reverted");
  }

  // 4. validator records a passing response
  console.log("\n[4] validator responds PASS (100)...");
  const t4 = await respondToValidation(requestHash, 100, `${requestURI}/result`, requestHash, "delivery");
  await pub.waitForTransactionReceipt({ hash: t4 });
  const status = await getValidationStatus(requestHash);
  console.log("    tx:", t4, "| on-chain response:", status.response, "| agentId:", status.agentId.toString());

  // 5. permissionless release now succeeds
  console.log("\n[5] release after passing validation...");
  const t5 = await wallet.writeContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "release", args: [escrowId],
  });
  await pub.waitForTransactionReceipt({ hash: t5 });
  const job = (await pub.readContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "getJob", args: [escrowId],
  })) as any[];
  const balAfterRelease = await pub.getBalance({ address: ESCROW_ADDRESS });
  console.log("    tx:", t5);
  console.log("    job.released:", job[7], "| escrow balance:", formatUnits(balAfterRelease, 18), "USDC");

  if (job[7] !== true) throw new Error("release did not mark job released");
  if (balAfterRelease >= balAfterOpen) throw new Error("escrow balance did not decrease on release");

  console.log("\n=== ESCROW E2E PASSED ===");
  console.log("released $" + AMOUNT_USDC + " to seller after on-chain validation");
  console.log("open:    " + txUrl(t2));
  console.log("respond: " + txUrl(t4));
  console.log("release: " + txUrl(t5));
}

main().catch((e) => {
  console.error("\nESCROW E2E FAILED:", e.message);
  process.exit(1);
});
