/**
 * Shared infrastructure for settlement strategies: the active chain, a read
 * client, and the operator wallet. Kept in its own module so both the
 * orchestrator and the individual strategies can import it without a cycle.
 */
import { createPublicClient, createWalletClient, defineChain, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../../config/chain-config.js";

export const chainConfig = getChainConfig();

export const settlementChain = defineChain({
  id: chainConfig.chainId,
  name: chainConfig.network,
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
});

export const settlementPublicClient = createPublicClient({
  chain: settlementChain,
  transport: http(),
});

/** The backend operator account that signs settlement txs (or null if unset). */
export function getOperatorAccount() {
  const raw = process.env.WALLET_PRIVATE_KEY || process.env.DEPLOY_PRIVATE_KEY;
  if (!raw) return null;
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
}

export function getOperatorWalletClient(): WalletClient | null {
  const account = getOperatorAccount();
  if (!account) return null;
  return createWalletClient({ account, chain: settlementChain, transport: http() });
}
