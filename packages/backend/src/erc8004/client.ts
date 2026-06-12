/**
 * ERC-8004 Viem Client Factory
 *
 * Provides singleton PublicClient and WalletClient for interacting
 * with ERC-8004 contracts on Arc Testnet (chainId: 5042002).
 */

import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC8004_RPC_URL, ERC8004_CHAIN_ID, ERC8004_EXPLORER_URL } from "./config.js";

const erc8004Chain = defineChain({
  id: ERC8004_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [ERC8004_RPC_URL] } },
  blockExplorers: { default: { name: "Arcscan", url: ERC8004_EXPLORER_URL } },
  testnet: true,
});

function normalizeKey(raw: string): `0x${string}` {
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _publicClient: any = null;

export function getERC8004PublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: erc8004Chain,
      transport: http(ERC8004_RPC_URL),
    });
  }
  return _publicClient;
}

export function getERC8004WalletClient() {
  const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key configured for ERC-8004 transactions (set WALLET_PRIVATE_KEY or ETH_PRIVATE_KEY)");
  }

  const account = privateKeyToAccount(normalizeKey(privateKey));
  return createWalletClient({
    account,
    chain: erc8004Chain,
    transport: http(ERC8004_RPC_URL),
  });
}

export function getERC8004Account() {
  const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key configured for ERC-8004 transactions");
  }
  return privateKeyToAccount(normalizeKey(privateKey));
}
