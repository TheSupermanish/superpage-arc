/**
 * ValidationEscrow contract config: validation-gated escrow for agent work.
 *
 * Address resolution order:
 *   1. ESCROW_ADDRESS env var
 *   2. escrow-deployment.json written by contracts/scripts/deploy-arc-escrow.ts
 *   3. zero address (feature disabled until deployed)
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function loadDeployment(): { address?: string; validationRegistry?: string } | null {
  const candidates = [
    path.join(__dirname, "escrow-deployment.json"),
    path.join(process.cwd(), "src/config/escrow-deployment.json"),
  ];
  for (const file of candidates) {
    try {
      if (existsSync(file)) return JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      // malformed: try next candidate
    }
  }
  return null;
}

const deployment = loadDeployment();

export const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS ||
  deployment?.address ||
  ZERO_ADDRESS) as `0x${string}`;

export function isEscrowDeployed(): boolean {
  return ESCROW_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
}

/** Pass score (0-100) at/above which the escrow contract releases. Mirrors PASS_THRESHOLD in the contract. */
export const ESCROW_PASS_THRESHOLD = 80;

/** ABI for the calls the backend makes. */
export const ESCROW_ABI = [
  {
    type: "function",
    name: "open",
    stateMutability: "payable",
    inputs: [
      { name: "seller", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "requestHash", type: "bytes32" },
      { name: "refundAfter", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "requestHash", type: "bytes32" },
      { name: "refundAfter", type: "uint64" },
      { name: "released", type: "bool" },
      { name: "refunded", type: "bool" },
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
    type: "function",
    name: "PASS_THRESHOLD",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "event",
    name: "EscrowOpened",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "agentId", type: "uint256", indexed: false },
      { name: "requestHash", type: "bytes32", indexed: false },
      { name: "refundAfter", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EscrowReleased",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "response", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EscrowRefunded",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

export { usdcToWei, weiToUsdc } from "./streampay.js";
