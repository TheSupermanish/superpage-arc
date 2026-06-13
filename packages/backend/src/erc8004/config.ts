/**
 * ERC-8004 Configuration
 *
 * Contract addresses and chain config for the ERC-8004 Trustless Agents
 * registries on Arc Testnet (chainId: 5042002).
 *
 * Addresses are env-overridable; the hardcoded defaults are filled in by the
 * Arc deploy script (packages/contracts/scripts/deploy-arc.ts). Until then
 * they are the zero address and ERC-8004 features degrade gracefully.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ERC8004_CHAIN_ID = 5042002;
export const ERC8004_NETWORK = "arc-testnet" as const;
export const ERC8004_RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
export const ERC8004_EXPLORER_URL = "https://testnet.arcscan.app";

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

/**
 * Address resolution order, per registry: env var, then the deployment JSON
 * written by contracts/scripts/deploy-arc-erc8004.ts, then the zero address
 * (features degrade gracefully until deployed).
 */
function loadDeployment(): Record<string, string> {
  const candidates = [
    path.join(__dirname, "../config/erc8004-deployment.json"),
    path.join(process.cwd(), "src/config/erc8004-deployment.json"),
  ];
  for (const file of candidates) {
    try {
      if (existsSync(file)) return JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      // Malformed file: fall through to next candidate
    }
  }
  return {};
}

const deployed = loadDeployment();

function resolveAddress(envVar: string, jsonKey: string): `0x${string}` {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.startsWith("0x")) return fromEnv as `0x${string}`;
  const fromJson = deployed[jsonKey];
  if (typeof fromJson === "string" && fromJson.startsWith("0x")) return fromJson as `0x${string}`;
  return ZERO;
}

export const ERC8004_CONTRACTS = {
  identityRegistry: resolveAddress("ERC8004_IDENTITY_REGISTRY", "identityRegistry"),
  reputationRegistry: resolveAddress("ERC8004_REPUTATION_REGISTRY", "reputationRegistry"),
  validationRegistry: resolveAddress("ERC8004_VALIDATION_REGISTRY", "validationRegistry"),
} as const;

/** True once the registries have been deployed and configured on Arc. */
export const ERC8004_DEPLOYED = ERC8004_CONTRACTS.identityRegistry !== ZERO;

export const ERC8004_EXTENSION_URI = "urn:eip:8004:trustless-agents";

export interface ERC8004Config {
  agentId: bigint | null;
  registrationUri: string;
  walletPrivateKey: string | undefined;
}

export function getERC8004Config(): ERC8004Config {
  const baseUrl = process.env.APP_URL || "http://localhost:2337";
  return {
    agentId: process.env.ERC8004_AGENT_ID ? BigInt(process.env.ERC8004_AGENT_ID) : null,
    registrationUri: process.env.ERC8004_REGISTRATION_URI || `${baseUrl}/.well-known/agent-registration.json`,
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY,
  };
}
