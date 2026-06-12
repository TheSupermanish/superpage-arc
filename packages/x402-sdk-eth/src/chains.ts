/**
 * Centralized Chain Registry — Arc (Circle's stablecoin-native L1) + Mezo.
 *
 * Arc: USDC is the native gas token (18 decimals at the native EVM level).
 * x402 payments on Arc use the ERC-20 USDC facade at 0x3600...0000 (6 decimals),
 * so the standard ERC-20 transfer/verification path applies unchanged.
 * Mezo: BTC native gas, MUSD default payment token.
 */

import { defineChain, type Chain } from "viem";

// ============================================================
// TYPES
// ============================================================

export type NetworkId = "arc-testnet" | "mezo" | "mezo-testnet";

export type TokenSymbol = "BTC" | "MUSD" | "USDC" | "EURC" | "USDT" | "DAI";

export type NativeTokenSymbol = "BTC" | "USDC";

export interface TokenConfig {
  symbol: TokenSymbol;
  decimals: number;
  address: `0x${string}` | null; // null for native tokens
}

export interface ChainMetadata {
  id: NetworkId;
  chainId: number;
  name: string;
  shortName: string;
  isTestnet: boolean;
  viemChain: Chain;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: {
    symbol: NativeTokenSymbol;
    name: string;
    decimals: number;
  };
  tokens: Partial<Record<Exclude<TokenSymbol, "BTC">, TokenConfig>>;
  defaultPaymentToken: TokenSymbol;
  displayCurrency?: string;
}

// ============================================================
// CHAIN DEFINITIONS
// ============================================================

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  network: "arc-testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  network: "mezo",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: {
    default: { http: ["https://mezo.drpc.org"] },
    public: { http: ["https://mezo.drpc.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" },
  },
  testnet: false,
});

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet (matsnet)",
  network: "mezo-testnet",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
    public: { http: ["https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});

// ============================================================
// CHAIN REGISTRY
// ============================================================

export const CHAIN_REGISTRY: Record<NetworkId, ChainMetadata> = {
  "arc-testnet": {
    id: "arc-testnet",
    chainId: 5042002,
    name: "Arc Testnet",
    shortName: "ARC-T",
    isTestnet: true,
    viemChain: arcTestnet,
    rpcUrl: "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    nativeToken: { symbol: "USDC", name: "USDC", decimals: 18 },
    tokens: {
      // Native USDC's ERC-20 facade (system contract). Payments transfer this.
      USDC: { symbol: "USDC", decimals: 6, address: "0x3600000000000000000000000000000000000000" },
      EURC: { symbol: "EURC", decimals: 6, address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" },
    },
    defaultPaymentToken: "USDC",
  },
  mezo: {
    id: "mezo",
    chainId: 31612,
    name: "Mezo",
    shortName: "MEZO",
    isTestnet: false,
    viemChain: mezoMainnet,
    rpcUrl: "https://mezo.drpc.org",
    explorerUrl: "https://explorer.mezo.org",
    nativeToken: { symbol: "BTC", name: "Bitcoin", decimals: 18 },
    tokens: {
      MUSD: { symbol: "MUSD", decimals: 18, address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186" },
      USDC: { symbol: "USDC", decimals: 6, address: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197" },
      USDT: { symbol: "USDT", decimals: 6, address: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E" },
      DAI: { symbol: "DAI", decimals: 18, address: "0x1531b6e3d51BF80f634957dF81A990B92dA4b154" },
    },
    defaultPaymentToken: "MUSD",
  },
  "mezo-testnet": {
    id: "mezo-testnet",
    chainId: 31611,
    name: "Mezo Testnet (matsnet)",
    shortName: "MEZOT",
    isTestnet: true,
    viemChain: mezoTestnet,
    rpcUrl: "https://rpc.test.mezo.org",
    explorerUrl: "https://explorer.test.mezo.org",
    nativeToken: { symbol: "BTC", name: "Bitcoin", decimals: 18 },
    tokens: {
      MUSD: { symbol: "MUSD", decimals: 18, address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" },
      // SuperPage MockUSDC deployed on matsnet (6 decimals, mintable, for testing the faucet/UI)
      USDC: { symbol: "USDC", decimals: 6, address: "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c" },
    },
    defaultPaymentToken: "MUSD",
  },
};

// ============================================================
// HELPERS
// ============================================================

export function getSupportedNetworks(): NetworkId[] {
  return Object.keys(CHAIN_REGISTRY) as NetworkId[];
}

export function isValidNetwork(networkId: string): networkId is NetworkId {
  return networkId in CHAIN_REGISTRY;
}

export function getChainMetadata(networkId: NetworkId): ChainMetadata {
  const chain = CHAIN_REGISTRY[networkId];
  if (!chain) throw new Error(`Unsupported network: ${networkId}`);
  return chain;
}

export function getChainId(networkId: NetworkId): number {
  return getChainMetadata(networkId).chainId;
}

export function getViemChain(networkId: NetworkId): Chain {
  return getChainMetadata(networkId).viemChain;
}

export function getRpcUrl(networkId: NetworkId): string {
  return getChainMetadata(networkId).rpcUrl;
}

export function getExplorerUrl(networkId: NetworkId): string {
  return getChainMetadata(networkId).explorerUrl;
}

export function getTxExplorerUrl(networkId: NetworkId, txHash: string): string {
  return `${getExplorerUrl(networkId)}/tx/${txHash}`;
}

export function isNativeToken(symbol: TokenSymbol): symbol is NativeTokenSymbol {
  // Deliberately BTC-only: on Arc, USDC is the native gas token but payments
  // go through its ERC-20 facade (it has an address), so it takes the ERC-20 path.
  return symbol === "BTC";
}

export function getTokenDecimals(networkId: NetworkId, symbol: TokenSymbol): number {
  const chain = getChainMetadata(networkId);
  if (isNativeToken(symbol)) return chain.nativeToken.decimals;
  const token = chain.tokens[symbol as Exclude<TokenSymbol, "BTC">];
  return token?.decimals ?? 18;
}

export function getTokenAddress(networkId: NetworkId, symbol: TokenSymbol): `0x${string}` | null {
  const chain = getChainMetadata(networkId);
  if (isNativeToken(symbol)) return null;
  const token = chain.tokens[symbol as Exclude<TokenSymbol, "BTC">];
  return token?.address ?? null;
}

export function getAvailableTokens(networkId: NetworkId): TokenSymbol[] {
  const chain = getChainMetadata(networkId);
  const tokens: TokenSymbol[] = [chain.nativeToken.symbol];
  for (const [symbol, config] of Object.entries(chain.tokens)) {
    if (config?.address) tokens.push(symbol as TokenSymbol);
  }
  return tokens;
}

export function getDefaultPaymentToken(networkId: NetworkId): TokenSymbol {
  return getChainMetadata(networkId).defaultPaymentToken;
}

export function getCurrencyDisplayName(networkId: NetworkId, symbol: TokenSymbol): string {
  const chain = getChainMetadata(networkId);
  if (chain.displayCurrency && symbol === "USDC") return chain.displayCurrency;
  return symbol;
}

export function getNetworkByChainId(chainId: number): NetworkId | null {
  for (const [networkId, meta] of Object.entries(CHAIN_REGISTRY)) {
    if (meta.chainId === chainId) return networkId as NetworkId;
  }
  return null;
}

export function getTestnetNetworks(): NetworkId[] {
  return Object.entries(CHAIN_REGISTRY)
    .filter(([_, meta]) => meta.isTestnet)
    .map(([id]) => id as NetworkId);
}

export function getMainnetNetworks(): NetworkId[] {
  return Object.entries(CHAIN_REGISTRY)
    .filter(([_, meta]) => !meta.isTestnet)
    .map(([id]) => id as NetworkId);
}

// ============================================================
// LEGACY COMPATIBILITY
// ============================================================

export function buildChainsRecord(): Record<NetworkId, Chain> {
  const chains: Record<string, Chain> = {};
  for (const [id, meta] of Object.entries(CHAIN_REGISTRY)) chains[id] = meta.viemChain;
  return chains as Record<NetworkId, Chain>;
}

export function buildChainIdsRecord(): Record<NetworkId, number> {
  const ids: Record<string, number> = {};
  for (const [id, meta] of Object.entries(CHAIN_REGISTRY)) ids[id] = meta.chainId;
  return ids as Record<NetworkId, number>;
}

export function buildTokenAddressesRecord(): Record<NetworkId, Record<string, `0x${string}`>> {
  const addresses: Record<string, Record<string, `0x${string}`>> = {};
  for (const [id, meta] of Object.entries(CHAIN_REGISTRY)) {
    addresses[id] = {};
    for (const [symbol, config] of Object.entries(meta.tokens)) {
      if (config?.address) addresses[id][symbol] = config.address;
    }
  }
  return addresses as Record<NetworkId, Record<string, `0x${string}`>>;
}

export const CHAINS = buildChainsRecord();
export const CHAIN_IDS = buildChainIdsRecord();
export const TOKEN_ADDRESSES = buildTokenAddressesRecord();

export const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
  BTC: 18, // Mezo native gas (18 decimals, not 8)
  MUSD: 18, // Mezo USD stablecoin
  USDC: 6, // ERC-20 facade decimals (Arc native balance is 18, facade is 6)
  EURC: 6,
  USDT: 6,
  DAI: 18,
};
