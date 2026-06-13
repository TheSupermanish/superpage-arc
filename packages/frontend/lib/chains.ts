/**
 * Chain Definitions for Frontend — Arc (Circle's stablecoin-native L1) + Mezo.
 *
 * Arc testnet is the default chain. Native gas on Arc: USDC
 * (18 decimals at the native EVM level; the ERC-20 facade at
 * 0x3600...0000 uses 6 decimals and is what payments transfer).
 */

import { defineChain, type Chain } from "viem";

// ============================================================
// Chain Definitions
// ============================================================

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
});

export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: {
    default: { http: ["https://mezo.drpc.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" },
  },
  testnet: false,
});

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet (matsnet)",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});

// ============================================================
// Chain Registry
// ============================================================

export const SUPPORTED_CHAINS: Chain[] = [arcTestnet, baseSepolia, mezoMainnet, mezoTestnet];

export const CHAIN_BY_ID: Record<number, Chain> = Object.fromEntries(
  SUPPORTED_CHAINS.map(chain => [chain.id, chain])
);

export const CHAIN_BY_NAME: Record<string, Chain> = {
  "arc-testnet": arcTestnet,
  "base-sepolia": baseSepolia,
  mezo: mezoMainnet,
  "mezo-testnet": mezoTestnet,
};

// ============================================================
// MetaMask Network Parameters
// ============================================================

export interface AddChainParameters {
  chainId: string; // hex
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export function getChainParameters(chain: Chain): AddChainParameters {
  return {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    rpcUrls: [...chain.rpcUrls.default.http],
    blockExplorerUrls: chain.blockExplorers?.default?.url
      ? [chain.blockExplorers.default.url]
      : undefined,
  };
}

// ============================================================
// Network Switching Utilities
// ============================================================

export async function switchNetwork(chainId: number): Promise<boolean> {
  if (typeof window === "undefined" || !window.ethereum) {
    console.error("[switchNetwork] MetaMask not found");
    return false;
  }

  const chain = CHAIN_BY_ID[chainId];
  if (!chain) {
    console.error(`[switchNetwork] Unknown chain ID: ${chainId}`);
    return false;
  }

  const hexChainId = `0x${chainId.toString(16)}`;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
    console.log(`[switchNetwork] Switched to ${chain.name}`);
    return true;
  } catch (error: any) {
    if (error.code === 4902) {
      console.log(`[switchNetwork] Network not found, adding ${chain.name}...`);
      return await addNetwork(chainId);
    }
    if (error.code === 4001) {
      console.log("[switchNetwork] User rejected network switch");
      return false;
    }
    console.error("[switchNetwork] Error:", error);
    return false;
  }
}

export async function addNetwork(chainId: number): Promise<boolean> {
  if (typeof window === "undefined" || !window.ethereum) {
    console.error("[addNetwork] MetaMask not found");
    return false;
  }

  const chain = CHAIN_BY_ID[chainId];
  if (!chain) {
    console.error(`[addNetwork] Unknown chain ID: ${chainId}`);
    return false;
  }

  const params = getChainParameters(chain);

  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [params],
    });
    console.log(`[addNetwork] Added ${chain.name}`);
    return true;
  } catch (error: any) {
    if (error.code === 4001) {
      console.log("[addNetwork] User rejected adding network");
      return false;
    }
    console.error("[addNetwork] Error:", error);
    return false;
  }
}

export async function getCurrentNetwork(): Promise<number | null> {
  if (typeof window === "undefined" || !window.ethereum) return null;
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    return parseInt(chainId, 16);
  } catch {
    return null;
  }
}

export async function ensureNetwork(expectedChainId: number): Promise<boolean> {
  const currentChainId = await getCurrentNetwork();
  if (currentChainId === expectedChainId) return true;
  console.log(`[ensureNetwork] Current: ${currentChainId}, Expected: ${expectedChainId}`);
  return await switchNetwork(expectedChainId);
}

// ============================================================
// Default Chain (from env)
// ============================================================

export function getDefaultChain(): Chain {
  const networkName = process.env.NEXT_PUBLIC_X402_CHAIN || "arc-testnet";
  return CHAIN_BY_NAME[networkName] || arcTestnet;
}

export function getDefaultChainId(): number {
  return getDefaultChain().id;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (params: any) => void) => void;
      removeListener: (event: string, callback: (params: any) => void) => void;
    };
  }
}
