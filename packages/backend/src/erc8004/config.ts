/**
 * ERC-8004 Configuration
 *
 * Contract addresses and chain config for the ERC-8004 Trustless Agents
 * registries deployed on Mezo Testnet / matsnet (chainId: 31611).
 */

export const ERC8004_CHAIN_ID = 31611;
export const ERC8004_NETWORK = "mezo-testnet" as const;
export const ERC8004_RPC_URL = "https://rpc.test.mezo.org";
export const ERC8004_EXPLORER_URL = "https://explorer.test.mezo.org";

export const ERC8004_CONTRACTS = {
  identityRegistry: "0x92b19730d0b7416f195600489cd9be29e109ebce" as `0x${string}`,
  reputationRegistry: "0x6a81e89fdb563cdf0d21dc2ea5c18ec4020e596f" as `0x${string}`,
  validationRegistry: "0x70d51bafea51fb2f60a06824c1bc5638e36243a1" as `0x${string}`,
} as const;

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
