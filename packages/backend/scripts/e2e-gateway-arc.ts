#!/usr/bin/env npx tsx
/**
 * End-to-end on-chain proof of a REAL Circle Gateway transfer on Arc testnet.
 *
 *   1. Ensure the operator has a Gateway deposit (approve + GatewayWallet.deposit)
 *   2. Build + EIP-712-sign a burn intent (operator -> recipient, single-chain Arc)
 *   3. POST it to Circle's /v1/transfer, receive an attestation
 *   4. GatewayMinter.gatewayMint(attestation, signature) on Arc settles it
 *
 * Single-wallet demo: depositor == signer == recipient (the operator), so USDC
 * round-trips through Gateway and nothing is lost. Proves the burn-intent
 * encoding + API + on-chain mint that the gateway settlement strategy uses.
 *
 * Usage: npx tsx scripts/e2e-gateway-arc.ts
 */
import { createPublicClient, createWalletClient, http, defineChain, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "crypto";
import "dotenv/config";

const CHAIN_ID = 5042002;
const SOURCE_DOMAIN = 26; // Arc testnet (Circle domain)
const API = process.env.GATEWAY_API_BASE || "https://gateway-api-testnet.circle.com";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as `0x${string}`;
const GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as `0x${string}`;
const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;

const DEPOSIT_USDC = 1.0;
const TRANSFER_USDC = 0.1;
const MAX_FEE_USDC = 0.5;
const atomic = (usdc: number) => BigInt(Math.round(usdc * 1e6));

const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const RAW = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
if (!RAW) throw new Error("WALLET_PRIVATE_KEY required");
const op = privateKeyToAccount(RAW.startsWith("0x") ? RAW : (`0x${RAW}` as `0x${string}`));
const wallet = createWalletClient({ account: op, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });

const ERC20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const WALLET_ABI = parseAbi(["function deposit(address token, uint256 value)"]);
const MINTER_ABI = parseAbi(["function gatewayMint(bytes attestationPayload, bytes signature)"]);

const bytes32 = (addr: string) =>
  ("0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")) as `0x${string}`;

async function apiBalance(): Promise<number> {
  const res = await fetch(`${API}/v1/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "USDC", sources: [{ domain: SOURCE_DOMAIN, depositor: op.address }] }),
  });
  const data: any = await res.json();
  const entry = (data.balances || []).find((b: any) => b.domain === SOURCE_DOMAIN);
  return entry ? parseFloat(entry.balance) : 0;
}

async function main() {
  console.log("=== Circle Gateway transfer E2E on Arc ===\n");
  console.log("operator (depositor/signer/recipient):", op.address);

  // 1. Ensure a Gateway deposit covers value + maxFee.
  let bal = await apiBalance();
  console.log(`gateway balance: ${bal} USDC`);
  if (bal < TRANSFER_USDC + MAX_FEE_USDC) {
    console.log(`\n[1] deposit ${DEPOSIT_USDC} USDC into Gateway...`);
    const allowance = (await pub.readContract({
      address: USDC, abi: ERC20, functionName: "allowance", args: [op.address, GATEWAY_WALLET],
    })) as bigint;
    if (allowance < atomic(DEPOSIT_USDC)) {
      const a = await wallet.writeContract({
        address: USDC, abi: ERC20, functionName: "approve", args: [GATEWAY_WALLET, atomic(DEPOSIT_USDC)],
      });
      await pub.waitForTransactionReceipt({ hash: a });
      console.log("    approved:", a);
    }
    const d = await wallet.writeContract({
      address: GATEWAY_WALLET, abi: WALLET_ABI, functionName: "deposit", args: [USDC, atomic(DEPOSIT_USDC)],
    });
    await pub.waitForTransactionReceipt({ hash: d });
    console.log("    deposited:", d);

    // Circle indexes the deposit after a few blocks; poll until it's spendable.
    process.stdout.write("    waiting for Circle to credit the deposit");
    for (let i = 0; i < 30; i++) {
      bal = await apiBalance();
      if (bal >= TRANSFER_USDC + MAX_FEE_USDC) break;
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 4000));
    }
    console.log(`\n    gateway balance now: ${bal} USDC`);
  }
  if (bal < TRANSFER_USDC + MAX_FEE_USDC) throw new Error("deposit not credited in time");

  // 2. Build + sign the burn intent (single-chain Arc -> Arc).
  console.log(`\n[2] build + sign burn intent (${TRANSFER_USDC} USDC -> ${op.address})...`);
  const spec = {
    version: 1,
    sourceDomain: SOURCE_DOMAIN,
    destinationDomain: SOURCE_DOMAIN,
    sourceContract: bytes32(GATEWAY_WALLET),
    destinationContract: bytes32(GATEWAY_MINTER),
    sourceToken: bytes32(USDC),
    destinationToken: bytes32(USDC),
    sourceDepositor: bytes32(op.address),
    destinationRecipient: bytes32(op.address),
    sourceSigner: bytes32(op.address),
    destinationCaller: bytes32("0x0000000000000000000000000000000000000000"),
    value: atomic(TRANSFER_USDC),
    salt: ("0x" + randomBytes(32).toString("hex")) as `0x${string}`,
    hookData: "0x" as `0x${string}`,
  };
  const message = { maxBlockHeight: (1n << 256n) - 1n, maxFee: atomic(MAX_FEE_USDC), spec };

  const types = {
    TransferSpec: [
      { name: "version", type: "uint32" },
      { name: "sourceDomain", type: "uint32" },
      { name: "destinationDomain", type: "uint32" },
      { name: "sourceContract", type: "bytes32" },
      { name: "destinationContract", type: "bytes32" },
      { name: "sourceToken", type: "bytes32" },
      { name: "destinationToken", type: "bytes32" },
      { name: "sourceDepositor", type: "bytes32" },
      { name: "destinationRecipient", type: "bytes32" },
      { name: "sourceSigner", type: "bytes32" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "value", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "hookData", type: "bytes" },
    ],
    BurnIntent: [
      { name: "maxBlockHeight", type: "uint256" },
      { name: "maxFee", type: "uint256" },
      { name: "spec", type: "TransferSpec" },
    ],
  } as const;

  const signature = await wallet.signTypedData({
    account: op,
    domain: { name: "GatewayWallet", version: "1" },
    types,
    primaryType: "BurnIntent",
    message: message as any,
  });
  console.log("    signed:", signature.slice(0, 20) + "...");

  // 3. POST to /v1/transfer (array of {burnIntent, signature}), bigints -> strings.
  console.log("\n[3] POST /v1/transfer...");
  const body = JSON.stringify([{ burnIntent: message, signature }], (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
  const res = await fetch(`${API}/v1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`/v1/transfer ${res.status}: ${text.slice(0, 500)}`);
  const result: any = JSON.parse(text);
  const attestation = result.attestation || result.attestationPayload || result[0]?.attestation;
  const attSig = result.signature || result[0]?.signature;
  console.log("    transferId:", result.transferId || result.id || "(n/a)");
  console.log("    attestation:", attestation ? attestation.slice(0, 24) + "..." : "(none)");
  if (!attestation || !attSig) {
    console.log("    full response:", text.slice(0, 600));
    throw new Error("no attestation/signature in /v1/transfer response");
  }

  // 4. Settle on-chain: gatewayMint on Arc.
  console.log("\n[4] gatewayMint on Arc...");
  const recipientBefore = (await pub.readContract({
    address: USDC, abi: ERC20, functionName: "balanceOf", args: [op.address],
  })) as bigint;
  const mint = await wallet.writeContract({
    address: GATEWAY_MINTER, abi: MINTER_ABI, functionName: "gatewayMint", args: [attestation, attSig],
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash: mint });
  const recipientAfter = (await pub.readContract({
    address: USDC, abi: ERC20, functionName: "balanceOf", args: [op.address],
  })) as bigint;
  console.log("    mint tx:", mint, "| status:", rcpt.status);
  console.log("    recipient USDC delta:", Number(recipientAfter - recipientBefore) / 1e6, "USDC");

  console.log("\n=== GATEWAY E2E PASSED ===");
  console.log("transfer settled via Circle Gateway burn intent + on-chain mint");
  console.log("mint: https://testnet.arcscan.app/tx/" + mint);
}

main().catch((e) => {
  console.error("\nGATEWAY E2E FAILED:", e.message);
  process.exit(1);
});
