/**
 * StreamPayPull (no-deposit approval/pull streaming) frontend config.
 *
 * The viewer approves a cap to this contract once (USDC stays in their wallet),
 * opens sessions, and the session key signs per-second vouchers; on close the
 * contract pulls the owed amount via transferFrom. Amounts are in the USDC
 * token's own 6-decimal units (what transferFrom moves).
 *
 * Address: NEXT_PUBLIC_STREAMPULL_ADDRESS, else zero (feature off until set).
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const STREAMPULL_ADDRESS = (process.env.NEXT_PUBLIC_STREAMPULL_ADDRESS ||
  ZERO_ADDRESS) as `0x${string}`;

/** USDC facade on Arc that the contract pulls against. */
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_ARC_USDC ||
  "0x3600000000000000000000000000000000000000") as `0x${string}`;

export function isStreamPullDeployed(): boolean {
  return STREAMPULL_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
}

/** USDC -> 6-decimal token units (vouchers + transferFrom unit). */
export function usdcToUnits(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1e6));
}
export function unitsToUsdc(units: bigint): number {
  return Number(units) / 1e6;
}

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const STREAMPULL_ABI = [
  {
    type: "function",
    name: "openSession",
    stateMutability: "nonpayable",
    inputs: [
      { name: "creator", type: "address" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "sessionKey", type: "address" },
      { name: "cap", type: "uint256" },
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
    type: "event",
    name: "SessionOpened",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "viewer", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "ratePerSecond", type: "uint256", indexed: false },
      { name: "cap", type: "uint256", indexed: false },
      { name: "sessionKey", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionClosed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "amountPaid", type: "uint256", indexed: false },
    ],
  },
] as const;
