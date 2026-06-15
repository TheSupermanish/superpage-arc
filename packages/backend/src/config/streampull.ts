/**
 * StreamPayPull contract config: no-deposit approval/pull streaming.
 *
 * Address resolution: STREAMPULL_ADDRESS env > streampull-deployment.json > zero.
 *
 * Amounts here are in the USDC token's own units (Arc facade = 6 decimals),
 * since that is what the contract's transferFrom moves — NOT the 18-decimal
 * native wei the old deposit-based StreamPay used.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function loadDeployedAddress(): string | null {
  const candidates = [
    path.join(__dirname, "streampull-deployment.json"),
    path.join(process.cwd(), "src/config/streampull-deployment.json"),
  ];
  for (const file of candidates) {
    try {
      if (existsSync(file)) {
        const json = JSON.parse(readFileSync(file, "utf-8"));
        if (typeof json.address === "string" && json.address.startsWith("0x")) return json.address;
      }
    } catch {
      // malformed: next candidate
    }
  }
  return null;
}

export const STREAMPULL_ADDRESS = (process.env.STREAMPULL_ADDRESS ||
  loadDeployedAddress() ||
  ZERO_ADDRESS) as `0x${string}`;

export function isStreamPullDeployed(): boolean {
  return STREAMPULL_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
}

/** USDC -> 6-decimal token units (what vouchers and transferFrom use). */
export function usdcToUnits(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1e6));
}

export function unitsToUsdc(units: bigint): number {
  return Number(units) / 1e6;
}

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
    type: "function",
    name: "getSession",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "viewer", type: "address" },
      { name: "creator", type: "address" },
      { name: "sessionKey", type: "address" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "cap", type: "uint256" },
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
