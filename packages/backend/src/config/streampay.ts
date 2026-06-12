/**
 * StreamPay contract config: pay-per-second streaming payment channels.
 *
 * Address resolution order:
 *   1. STREAMPAY_ADDRESS env var
 *   2. streampay-deployment.json written by contracts/scripts/deploy-arc.ts
 *   3. zero address (feature disabled until deployed)
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function loadDeployedAddress(): string | null {
  // Checked in both tsx (src/) and compiled (dist/) layouts
  const candidates = [
    path.join(__dirname, "streampay-deployment.json"),
    path.join(process.cwd(), "src/config/streampay-deployment.json"),
  ];
  for (const file of candidates) {
    try {
      if (existsSync(file)) {
        const json = JSON.parse(readFileSync(file, "utf-8"));
        if (typeof json.address === "string" && json.address.startsWith("0x")) {
          return json.address;
        }
      }
    } catch {
      // Malformed deployment file: fall through to next candidate
    }
  }
  return null;
}

export const STREAMPAY_ADDRESS = (process.env.STREAMPAY_ADDRESS ||
  loadDeployedAddress() ||
  ZERO_ADDRESS) as `0x${string}`;

export function isStreamPayDeployed(): boolean {
  return STREAMPAY_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
}

/** Minimal ABI for the calls the backend makes (read sessions, close them). */
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
    type: "function",
    name: "lastId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
  {
    type: "event",
    name: "SessionReclaimed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "refund", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * Rate conversion shared with the frontend (lib/streampay.ts must match):
 * USDC amounts are quantized to 6 decimals (micro-USDC) then scaled to
 * native 18-decimal wei, avoiding float drift between the two sides.
 */
export function usdcToWei(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1e6)) * 1_000_000_000_000n;
}

export function weiToUsdc(wei: bigint): number {
  return Number(wei / 1_000_000_000_000n) / 1e6;
}
