/**
 * ERC-8004 Viem Client Factory
 *
 * Provides singleton PublicClient and WalletClient for interacting
 * with ERC-8004 contracts on Mezo Testnet / matsnet (chainId: 31611).
 */

import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC8004_RPC_URL } from "./config.js";

const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet (matsnet)",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" } },
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
      chain: mezoTestnet,
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
    chain: mezoTestnet,
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
