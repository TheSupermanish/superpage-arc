/**
 * StreamPay contract config (frontend): pay-per-second streaming channels.
 *
 * Address resolution: NEXT_PUBLIC_STREAMPAY_ADDRESS env var, else the
 * hardcoded fallback below (update it after contracts/scripts/deploy-arc.ts
 * runs; this is the single place the fallback lives).
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Filled in after deploy-arc.ts succeeds (deployer wallet needs Arc USDC)
const STREAMPAY_FALLBACK_ADDRESS = ZERO_ADDRESS;

export const STREAMPAY_ADDRESS = (process.env.NEXT_PUBLIC_STREAMPAY_ADDRESS ||
  STREAMPAY_FALLBACK_ADDRESS) as `0x${string}`;

export function isStreamPayDeployed(): boolean {
  return STREAMPAY_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
}

export const STREAMPAY_ABI = [
  {
    type: "function",
    name: "openSession",
    stateMutability: "payable",
    inputs: [
      { name: "creator", type: "address" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "sessionKey", type: "address" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "closeSession",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "amountOwed", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reclaimExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getSession",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "viewer", type: "address" },
      { name: "creator", type: "address" },
      { name: "sessionKey", type: "address" },
      { name: "deposit", type: "uint256" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "openedAt", type: "uint64" },
      { name: "open", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "SessionOpened",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "viewer", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "ratePerSecond", type: "uint256", indexed: false },
      { name: "deposit", type: "uint256", indexed: false },
      { name: "sessionKey", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionClosed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "amountPaid", type: "uint256", indexed: false },
      { name: "refund", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * USDC <-> native wei (18 decimals) conversion, quantized to 6 decimals
 * (micro-USDC) so the backend (config/streampay.ts) computes the identical
 * rate from the same float price.
 */
export function usdcToWei(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1e6)) * 1_000_000_000_000n;
}

export function weiToUsdc(wei: bigint): number {
  return Number(wei / 1_000_000_000_000n) / 1e6;
}
