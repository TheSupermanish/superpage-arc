/**
 * Centralized chain and currency configuration — Arc (Circle's stablecoin-native L1) first.
 *
 * Arc testnet: chainId 5042002, USDC is the native gas token (18 decimals at the
 * native EVM level). Payments use the ERC-20 USDC facade at 0x3600...0000 (6 decimals),
 * so on-chain verification stays on the standard ERC-20 transfer path.
 * Mezo kept for back-compat (BTC gas, MUSD payment token).
 */

// ============================================================
// Defaults
// ============================================================

/** Default network used when none is specified (env override: X402_CHAIN) */
export const DEFAULT_NETWORK: NetworkId = (process.env.X402_CHAIN as NetworkId) || "arc-testnet";

/** Default payment asset */
export const DEFAULT_ASSET = "USDC";

/** SuperPage payment scheme identifier */
export const SPAY_SCHEME = "spay";

// ============================================================
// Type Definitions
// ============================================================

export type NetworkId = "arc-testnet" | "base-sepolia" | "mezo" | "mezo-testnet";

export type TokenSymbol = "BTC" | "ETH" | "MUSD" | "USDC" | "EURC";

export type NativeTokenSymbol = "BTC" | "ETH" | "USDC";

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
  /** Offered to users in the multichain selector (default chain listed first). */
  enabled?: boolean;
  /** Pay-per-second streaming (native-USDC channel) is supported here. */
  supportsStreaming?: boolean;
  /** Circle Gateway nanopayment batching is available here (Circle-supported chain). */
  supportsGateway?: boolean;
}

export type { ChainMetadata };

// ============================================================
// Token Decimals
// ============================================================

export const TOKEN_DECIMALS: Record<string, number> = {
  BTC: 18,  // Mezo native gas token (18 decimals)
  ETH: 18,  // Base native gas token
  MUSD: 18, // Mezo USD stablecoin (verified on-chain: 18 decimals)
  USDC: 6,  // Arc ERC-20 facade decimals (native balance is 18)
  EURC: 6,
};

// ============================================================
// Chain Registry
// ============================================================

export const CHAIN_REGISTRY: Record<NetworkId, ChainMetadata> = {
  "arc-testnet": {
    chainId: 5042002,
    name: "Arc Testnet",
    rpcUrl: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    nativeToken: { symbol: "USDC", decimals: 18 },
    tokens: {
      // Native USDC's ERC-20 facade (system contract, 6 decimals)
      USDC: { address: "0x3600000000000000000000000000000000000000", decimals: 6 },
      EURC: { address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6 },
    },
    defaultPaymentToken: "USDC",
    isTestnet: true,
    enabled: true,
    supportsStreaming: true, // USDC-as-native-gas enables the StreamPay channel
    supportsGateway: true, // Circle Gateway domain 26
  },
  "base-sepolia": {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    nativeToken: { symbol: "ETH", decimals: 18 },
    tokens: {
      USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    },
    defaultPaymentToken: "USDC",
    isTestnet: true,
    enabled: true,
    supportsStreaming: false, // gas is ETH, not USDC, so the native channel does not apply
    supportsGateway: true, // Circle Gateway domain 6
  },
  mezo: {
    chainId: 31612,
    name: "Mezo",
    rpcUrl: "https://mezo.drpc.org",
    explorerUrl: "https://explorer.mezo.org",
    nativeToken: { symbol: "BTC", decimals: 18 },
    tokens: {
      MUSD: { address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186", decimals: 18 },
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
      // SuperPage MockUSDC on matsnet (6 decimals, mintable) — keeps amounts aligned with Arc/Base
      USDC: { address: "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c", decimals: 6 },
    },
    defaultPaymentToken: "USDC",
    isTestnet: true,
    enabled: true,
    supportsStreaming: false, // gas is BTC, not USDC, so the native channel does not apply
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
  // Deliberately BTC-only: on Arc, USDC is native gas but payments use its
  // ERC-20 facade (it has an address), so USDC routes through the ERC-20 path.
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
  return chain.displayCurrency ?? symbol;
}

export function getSupportedNetworks(): NetworkId[] {
  return Object.keys(CHAIN_REGISTRY) as NetworkId[];
}

/**
 * Networks offered to users / agents in the multichain flow, default first.
 * Mezo stays in the registry for back-compat but is not surfaced here.
 */
export function getEnabledNetworks(): NetworkId[] {
  const order: NetworkId[] = ["arc-testnet", "base-sepolia", "mezo-testnet"];
  return (Object.keys(CHAIN_REGISTRY) as NetworkId[])
    .filter((id) => CHAIN_REGISTRY[id].enabled)
    .sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
}

export function supportsStreaming(networkId: NetworkId): boolean {
  return CHAIN_REGISTRY[networkId]?.supportsStreaming === true;
}

export function supportsGateway(networkId: NetworkId): boolean {
  return CHAIN_REGISTRY[networkId]?.supportsGateway === true;
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
