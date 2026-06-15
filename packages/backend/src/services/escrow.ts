/**
 * ValidationEscrow service: open / release / refund / read validation-gated
 * escrows on Arc. Reuses the ERC-8004 Arc clients (same chain + wallet) so the
 * escrow and the registry it's gated on share one signer.
 */
import type { Hash } from "viem";
import { getERC8004PublicClient, getERC8004WalletClient } from "../erc8004/index.js";
import { ESCROW_ADDRESS, ESCROW_ABI, isEscrowDeployed, usdcToWei, weiToUsdc } from "../config/escrow.js";

export interface EscrowJob {
  id: number;
  buyer: string;
  seller: string;
  amountUsdc: number;
  agentId: number;
  requestHash: string;
  refundAfter: number;
  released: boolean;
  refunded: boolean;
  status: "open" | "released" | "refunded";
}

function assertDeployed() {
  if (!isEscrowDeployed()) throw new Error("ValidationEscrow is not deployed");
}

/**
 * Open an escrow holding `amountUsdc` for `seller`, gated on a passing ERC-8004
 * validation for `agentId` under `requestHash`. Returns the new escrow id + tx.
 */
export async function openEscrow(params: {
  seller: `0x${string}`;
  agentId: bigint;
  requestHash: `0x${string}`;
  amountUsdc: number;
  refundAfterSeconds?: number;
}): Promise<{ id: number; txHash: Hash }> {
  assertDeployed();
  const wallet = getERC8004WalletClient();
  const pub = getERC8004PublicClient();
  const refundAfter = BigInt(Math.floor(Date.now() / 1000) + (params.refundAfterSeconds ?? 86400));

  const txHash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "open",
    args: [params.seller, params.agentId, params.requestHash, refundAfter],
    value: usdcToWei(params.amountUsdc),
  });
  await pub.waitForTransactionReceipt({ hash: txHash });

  const id = (await pub.readContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "lastId",
  })) as bigint;
  return { id: Number(id), txHash };
}

/** Release an escrow. Permissionless on-chain; reverts unless validation passed. */
export async function releaseEscrow(id: number): Promise<Hash> {
  assertDeployed();
  const wallet = getERC8004WalletClient();
  const pub = getERC8004PublicClient();
  const txHash = await wallet.writeContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "release", args: [BigInt(id)],
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/** Refund an escrow to the buyer (after deadline, or once validation failed). */
export async function refundEscrow(id: number): Promise<Hash> {
  assertDeployed();
  const wallet = getERC8004WalletClient();
  const pub = getERC8004PublicClient();
  const txHash = await wallet.writeContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "refund", args: [BigInt(id)],
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/** Read an escrow's on-chain state. */
export async function getEscrow(id: number): Promise<EscrowJob> {
  assertDeployed();
  const pub = getERC8004PublicClient();
  const j = (await pub.readContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "getJob", args: [BigInt(id)],
  })) as readonly [string, string, bigint, bigint, string, bigint, boolean, boolean];

  const released = j[6];
  const refunded = j[7];
  return {
    id,
    buyer: j[0],
    seller: j[1],
    amountUsdc: weiToUsdc(j[2]),
    agentId: Number(j[3]),
    requestHash: j[4],
    refundAfter: Number(j[5]),
    released,
    refunded,
    status: released ? "released" : refunded ? "refunded" : "open",
  };
}
