/**
 * Centralized chain and currency configuration — Mezo.
 *
 * Mezo (Bitcoin economic layer L2, EVM-compatible) is the only supported chain.
 * Native gas: BTC (18 decimals). Default payment token: MUSD (BTC-backed stablecoin).
 */

// ============================================================
// Defaults
// ============================================================

/** Default network used when none is specified (env override: X402_CHAIN) */
export const DEFAULT_NETWORK: NetworkId = (process.env.X402_CHAIN as NetworkId) || "mezo-testnet";

/** Default payment asset */
export const DEFAULT_ASSET = "MUSD";

/** SuperPage payment scheme identifier */
export const SPAY_SCHEME = "spay";

// ============================================================
// Type Definitions
// ============================================================

export type NetworkId = "mezo" | "mezo-testnet";

export type TokenSymbol = "BTC" | "MUSD" | "USDC" | "USDT" | "DAI";

export type NativeTokenSymbol = "BTC";

interface TokenConfig {
  address: string;
  decimals: number;
}

interface ChainMetadata {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: {
    symbol: string;
    decimals: number;
  };
  tokens: Record<string, TokenConfig>;
  defaultPaymentToken: string;
  displayCurrency?: string;
  isTestnet: boolean;
}

export type { ChainMetadata };

// ============================================================
// Token Decimals
// ============================================================

export const TOKEN_DECIMALS: Record<string, number> = {
  BTC: 18,  // Mezo native gas token (18 decimals)
  MUSD: 18, // Mezo USD stablecoin (verified on-chain: 18 decimals)
  USDC: 6,
  USDT: 6,
  DAI: 18,
};

// ============================================================
// Chain Registry
// ============================================================

export const CHAIN_REGISTRY: Record<NetworkId, ChainMetadata> = {
  mezo: {
    chainId: 31612,
    name: "Mezo",
    rpcUrl: "https://mezo.drpc.org",
    explorerUrl: "https://explorer.mezo.org",
    nativeToken: { symbol: "BTC", decimals: 18 },
    tokens: {
      MUSD: { address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186", decimals: 18 },
      USDC: { address: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197", decimals: 6 }, // mUSDC (bridged)
      USDT: { address: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E", decimals: 6 }, // mUSDT (bridged)
      DAI: { address: "0x1531b6e3d51BF80f634957dF81A990B92dA4b154", decimals: 18 }, // mDAI (bridged)
    },
    defaultPaymentToken: "MUSD",
    isTestnet: false,
  },
  "mezo-testnet": {
    chainId: 31611,
    name: "Mezo Testnet (matsnet)",
    rpcUrl: "https://rpc.test.mezo.org",
    explorerUrl: "https://explorer.test.mezo.org",
    nativeToken: { symbol: "BTC", decimals: 18 },
    tokens: {
      MUSD: { address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503", decimals: 18 },
      // SuperPage MockUSDC deployed on matsnet (6 decimals, mintable, for testing)
      USDC: { address: "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c", decimals: 6 },
    },
    defaultPaymentToken: "MUSD",
    isTestnet: true,
  },
};

// ============================================================
// Helper Functions
// ============================================================

export function isValidNetwork(networkId: string): networkId is NetworkId {
  return networkId in CHAIN_REGISTRY;
}

export function getChainMetadata(networkId: NetworkId) {
  const chain = CHAIN_REGISTRY[networkId];
  if (!chain) throw new Error(`Unsupported network: ${networkId}`);
  return chain;
}

export function getChainId(networkId: NetworkId): number {
  return getChainMetadata(networkId).chainId;
}

export function isNativeToken(symbol: TokenSymbol): symbol is NativeTokenSymbol {
  return symbol === "BTC";
}

export function getTokenDecimalsForNetwork(networkId: NetworkId, symbol: TokenSymbol): number {
  const chain = getChainMetadata(networkId);
  if (isNativeToken(symbol)) return chain.nativeToken.decimals;
  const token = chain.tokens[symbol as Exclude<TokenSymbol, NativeTokenSymbol>];
  return token?.decimals ?? TOKEN_DECIMALS[symbol] ?? 18;
}

export function getTokenAddressForNetwork(networkId: NetworkId, symbol: TokenSymbol): string | null {
  const chain = getChainMetadata(networkId);
  if (isNativeToken(symbol)) return null;
  const token = chain.tokens[symbol as Exclude<TokenSymbol, NativeTokenSymbol>];
  return token?.address ?? null;
}

export function getAvailableTokens(networkId: NetworkId): TokenSymbol[] {
  const chain = getChainMetadata(networkId);
  const tokens: TokenSymbol[] = [chain.nativeToken.symbol as TokenSymbol];
  for (const [symbol, config] of Object.entries(chain.tokens)) {
    if (config?.address) tokens.push(symbol as TokenSymbol);
  }
  return tokens;
}

export function getDefaultPaymentToken(networkId: NetworkId): TokenSymbol {
  return getChainMetadata(networkId).defaultPaymentToken as TokenSymbol;
}

export function getCurrencyDisplayName(networkId: NetworkId, symbol: TokenSymbol): string {
  const chain = getChainMetadata(networkId);
  if (chain.displayCurrency && symbol === "USDC") return chain.displayCurrency;
  return symbol;
}

export function getSupportedNetworks(): NetworkId[] {
  return Object.keys(CHAIN_REGISTRY) as NetworkId[];
}

// ============================================================
// ChainConfig Interface
// ============================================================

export interface ChainConfig {
  network: NetworkId;
  currency: TokenSymbol;
  tokenAddress: string;
  tokenDecimals: number;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
}

export function getChainConfig(): ChainConfig {
  const networkEnv = process.env.X402_CHAIN || DEFAULT_NETWORK;

  if (!isValidNetwork(networkEnv)) {
    console.warn(`Unknown network: ${networkEnv}, falling back to ${DEFAULT_NETWORK}`);
  }

  const network = isValidNetwork(networkEnv) ? networkEnv : DEFAULT_NETWORK;
  const chainMeta = getChainMetadata(network);

  const currencyEnv = process.env.X402_CURRENCY;
  const currency = (currencyEnv as TokenSymbol) || getDefaultPaymentToken(network);

  let tokenAddress = process.env.X402_TOKEN_ADDRESS;
  if (!tokenAddress) {
    const addr = getTokenAddressForNetwork(network, currency);
    tokenAddress = addr || "0x0000000000000000000000000000000000000000";
  }

  let tokenDecimals: number;
  if (process.env.X402_TOKEN_DECIMALS) {
    tokenDecimals = parseInt(process.env.X402_TOKEN_DECIMALS, 10);
  } else {
    tokenDecimals = getTokenDecimalsForNetwork(network, currency);
  }

  return {
    network,
    currency,
    tokenAddress,
    tokenDecimals,
    chainId: chainMeta.chainId,
    rpcUrl: chainMeta.rpcUrl,
    explorerUrl: chainMeta.explorerUrl,
    isTestnet: chainMeta.isTestnet,
  };
}

// ============================================================
// Convenience Exports
// ============================================================

export function getNetwork(): NetworkId {
  return getChainConfig().network;
}

export function getCurrency(): TokenSymbol {
  return getChainConfig().currency;
}

export function getTokenAddress(): string {
  return getChainConfig().tokenAddress;
}

export function getTokenDecimals(): number {
  return getChainConfig().tokenDecimals;
}

export function getRpcUrl(): string {
  return getChainConfig().rpcUrl;
}

export function getExplorerUrl(): string {
  return getChainConfig().explorerUrl;
}

export function getTxExplorerUrl(txHash: string): string {
  return `${getExplorerUrl()}/tx/${txHash}`;
}
