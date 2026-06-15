/**
 * ValidationEscrow service: open / release / refund / read validation-gated
 * escrows on Arc. Reuses the ERC-8004 Arc clients (same chain + wallet) so the
 * escrow and the registry it's gated on share one signer.
 */
import type { Hash } from "viem";
import { decodeEventLog } from "viem";
import { getERC8004PublicClient, getERC8004WalletClient } from "../erc8004/index.js";
import { ESCROW_ADDRESS, ESCROW_ABI, isEscrowDeployed, usdcToWei, weiToUsdc } from "../config/escrow.js";

export interface EscrowJob {
  id: number;
  buyer: string;
  seller: string;
  validator: string;
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
  validator: `0x${string}`;
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
    args: [params.seller, params.agentId, params.validator, params.requestHash, refundAfter],
    value: usdcToWei(params.amountUsdc),
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });

  // Derive the id from this tx's EscrowOpened event, not a follow-up lastId read
  // (lastId is racy under the shared backend signer if opens overlap).
  let id = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "EscrowOpened") {
        id = Number((ev.args as { id: bigint }).id);
        break;
      }
    } catch {
      // not the event we want
    }
  }
  if (id === 0) throw new Error("openEscrow: EscrowOpened event not found in receipt");
  return { id, txHash };
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
  })) as readonly [string, string, string, bigint, bigint, string, bigint, boolean, boolean];

  const released = j[7];
  const refunded = j[8];
  return {
    id,
    buyer: j[0],
    seller: j[1],
    validator: j[2],
    amountUsdc: weiToUsdc(j[3]),
    agentId: Number(j[4]),
    requestHash: j[5],
    refundAfter: Number(j[6]),
    released,
    refunded,
    status: released ? "released" : refunded ? "refunded" : "open",
  };
}
