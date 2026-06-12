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

export const ERC8004_CHAIN_ID = 5042002;
export const ERC8004_NETWORK = "arc-testnet" as const;
export const ERC8004_RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
export const ERC8004_EXPLORER_URL = "https://testnet.arcscan.app";

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export const ERC8004_CONTRACTS = {
  identityRegistry: (process.env.ERC8004_IDENTITY_REGISTRY as `0x${string}`) || ZERO,
  reputationRegistry: (process.env.ERC8004_REPUTATION_REGISTRY as `0x${string}`) || ZERO,
  validationRegistry: (process.env.ERC8004_VALIDATION_REGISTRY as `0x${string}`) || ZERO,
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
