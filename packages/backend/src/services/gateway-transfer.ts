/**
 * Circle Gateway transfer primitive (proven on Arc, see scripts/e2e-gateway-arc.ts).
 *
 * The real burn-intent flow Circle Gateway uses: an operator deposits USDC into
 * the GatewayWallet once, then signs an EIP-712 "burn intent" per payout. The
 * signed intents are POSTed to /v1/transfer (an array — this is the batch), Circle
 * returns an attestation per intent, and GatewayMinter.gatewayMint settles each
 * on the destination chain. Many sub-cent payouts settle from one deposit, which
 * is the nanopayment-batching win.
 *
 * This module is the reusable primitive; gateway-settlement.ts batches stream
 * payouts through it.
 */
import { createWalletClient, http, defineChain, parseAbi, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "crypto";
import { getChainConfig } from "../config/chain-config.js";
import {
  GATEWAY_WALLET_ADDRESS,
  GATEWAY_MINTER_ADDRESS,
  GATEWAY_API_BASE,
  getGatewayDomain,
} from "../config/gateway.js";
import { settlementPublicClient } from "./settlement/context.js";

const chainConfig = getChainConfig();
const USDC = chainConfig.tokenAddress as `0x${string}`;

const arc = defineChain({
  id: chainConfig.chainId,
  name: chainConfig.network,
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
});

const ERC20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const WALLET_ABI = parseAbi(["function deposit(address token, uint256 value)"]);
const MINTER_ABI = parseAbi(["function gatewayMint(bytes attestationPayload, bytes signature)"]);

/** EIP-712 types for a Gateway burn intent (single-chain or cross-chain). */
const BURN_INTENT_TYPES = {
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

const ZERO32 = `0x${"0".repeat(64)}` as `0x${string}`;

export function usdcToAtomic(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1e6));
}

function bytes32(addr: string): `0x${string}` {
  return ("0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")) as `0x${string}`;
}

export function getGatewayOperator() {
  const raw = process.env.WALLET_PRIVATE_KEY || process.env.DEPLOY_PRIVATE_KEY;
  if (!raw) return null;
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
}

function operatorWallet(): WalletClient | null {
  const account = getGatewayOperator();
  if (!account) return null;
  return createWalletClient({ account, chain: arc, transport: http() });
}

/** A single signed burn intent ready to POST to /v1/transfer. */
export interface SignedBurnIntent {
  burnIntent: Record<string, unknown>;
  signature: `0x${string}`;
}

/**
 * Build + sign one burn intent: operator pays `to` `valueUsdc` on the active
 * chain, from the operator's Gateway deposit. Single-chain (source == dest).
 */
export async function signBurnIntent(
  to: `0x${string}`,
  valueUsdc: number,
  maxFeeUsdc: number
): Promise<SignedBurnIntent> {
  const wallet = operatorWallet();
  const account = getGatewayOperator();
  if (!wallet || !account) throw new Error("no operator key for Gateway");
  const domain = getGatewayDomain();
  if (domain === null) throw new Error(`chain ${chainConfig.network} has no Circle domain`);

  const spec = {
    version: 1,
    sourceDomain: domain,
    destinationDomain: domain,
    sourceContract: bytes32(GATEWAY_WALLET_ADDRESS),
    destinationContract: bytes32(GATEWAY_MINTER_ADDRESS),
    sourceToken: bytes32(USDC),
    destinationToken: bytes32(USDC),
    sourceDepositor: bytes32(account.address),
    destinationRecipient: bytes32(to),
    sourceSigner: bytes32(account.address),
    destinationCaller: ZERO32,
    value: usdcToAtomic(valueUsdc),
    salt: ("0x" + randomBytes(32).toString("hex")) as `0x${string}`,
    hookData: "0x" as `0x${string}`,
  };
  const message = { maxBlockHeight: (1n << 256n) - 1n, maxFee: usdcToAtomic(maxFeeUsdc), spec };

  const signature = await wallet.signTypedData({
    account,
    domain: { name: "GatewayWallet", version: "1" },
    types: BURN_INTENT_TYPES,
    primaryType: "BurnIntent",
    message: message as any,
  });
  return { burnIntent: message, signature };
}

/**
 * Submit a batch of signed burn intents to Circle's /v1/transfer in one call,
 * returning Circle's attestation + signature for each. This array POST is the
 * batch: N payouts, one API round-trip.
 */
export async function submitTransfers(
  intents: SignedBurnIntent[]
): Promise<Array<{ attestation: `0x${string}`; signature: `0x${string}` }>> {
  const body = JSON.stringify(intents, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const res = await fetch(`${GATEWAY_API_BASE}/v1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`/v1/transfer ${res.status}: ${text.slice(0, 400)}`);
  const json: any = JSON.parse(text);
  // Circle returns either a single object or an array depending on input length.
  const rows = Array.isArray(json) ? json : [json];
  return rows.map((r: any) => ({
    attestation: (r.attestation || r.attestationPayload) as `0x${string}`,
    signature: (r.signature || r.attestationSignature) as `0x${string}`,
  }));
}

/** Settle attestations on-chain via GatewayMinter.gatewayMint. Returns tx hashes. */
export async function mintAttestations(
  attestations: Array<{ attestation: `0x${string}`; signature: `0x${string}` }>
): Promise<string[]> {
  const wallet = operatorWallet();
  const account = getGatewayOperator();
  if (!wallet || !account) throw new Error("no operator key for Gateway mint");

  const hashes: string[] = [];
  for (const att of attestations) {
    if (!att.attestation || !att.signature) throw new Error("missing attestation/signature");
    const hash = await wallet.writeContract({
      address: GATEWAY_MINTER_ADDRESS,
      abi: MINTER_ABI,
      functionName: "gatewayMint",
      args: [att.attestation, att.signature],
      chain: arc,
      account,
    });
    await settlementPublicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  return hashes;
}

/** Execute the one-time operator deposit (approve + GatewayWallet.deposit). */
export async function executeDeposit(usdc: number): Promise<{ approveTx?: string; depositTx: string }> {
  const wallet = operatorWallet();
  const account = getGatewayOperator();
  if (!wallet || !account) throw new Error("no operator key for Gateway deposit");
  const value = usdcToAtomic(usdc);

  let approveTx: string | undefined;
  const allowance = (await settlementPublicClient.readContract({
    address: USDC, abi: ERC20, functionName: "allowance", args: [account.address, GATEWAY_WALLET_ADDRESS],
  })) as bigint;
  if (allowance < value) {
    approveTx = await wallet.writeContract({
      address: USDC, abi: ERC20, functionName: "approve", args: [GATEWAY_WALLET_ADDRESS, value], chain: arc, account,
    });
    await settlementPublicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
  }
  const depositTx = await wallet.writeContract({
    address: GATEWAY_WALLET_ADDRESS, abi: WALLET_ABI, functionName: "deposit", args: [USDC, value], chain: arc, account,
  });
  await settlementPublicClient.waitForTransactionReceipt({ hash: depositTx as `0x${string}` });
  return { approveTx, depositTx };
}
