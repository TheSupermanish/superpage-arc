/**
 * Frontend chain configuration — Arc (Circle's stablecoin-native L1) first,
 * with Mezo kept for back-compat.
 *
 * Arc testnet: chainId 5042002, USDC is the native gas token. Payments use
 * the ERC-20 USDC facade at 0x3600...0000 (6 decimals).
 */

const CHAIN_DEFAULTS: Record<string, { defaultCurrency: string; displayCurrency?: string }> = {
  "arc-testnet": { defaultCurrency: "USDC" },
  "base-sepolia": { defaultCurrency: "USDC" },
  "mezo": { defaultCurrency: "MUSD" },
  "mezo-testnet": { defaultCurrency: "MUSD" },
};

const NATIVE_TOKENS: Record<string, string> = {
  "arc-testnet": "USDC",
  "base-sepolia": "ETH",
  "mezo": "BTC",
  "mezo-testnet": "BTC",
};

export const CHAIN_IDS: Record<string, number> = {
  "arc-testnet": 5042002,
  "base-sepolia": 84532,
  "mezo": 31612,
  "mezo-testnet": 31611,
};

export const EXPLORER_URLS: Record<string, string> = {
  "arc-testnet": "https://testnet.arcscan.app",
  "base-sepolia": "https://sepolia.basescan.org",
  "mezo": "https://explorer.mezo.org",
  "mezo-testnet": "https://explorer.test.mezo.org",
};

// Default x402 payment token per network.
// Arc: native USDC's ERC-20 facade (6 decimals).
// Base Sepolia: Circle USDC (6 decimals).
// Mezo: MUSD, the BTC-backed stablecoin (18 decimals).
export const PAYMENT_TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  "arc-testnet": "0x3600000000000000000000000000000000000000",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "mezo": "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  "mezo-testnet": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
};

export const PAYMENT_TOKEN_DECIMALS: Record<string, number> = {
  "arc-testnet": 6,
  "base-sepolia": 6,
  "mezo": 18,
  "mezo-testnet": 18,
};

/** @deprecated use PAYMENT_TOKEN_ADDRESSES — kept for older call sites */
export const MUSD_ADDRESSES = PAYMENT_TOKEN_ADDRESSES;

// ============================================================
// Multichain: enabled chains + user-selected chain
// ============================================================

export interface ChainOption {
  id: string;
  label: string;
  shortLabel: string;
  chainId: number;
  /** Per-second streaming (native-USDC channel) only works on Arc. */
  supportsStreaming: boolean;
}

/** Chains offered in the selector, default (Arc) first. */
export const ENABLED_CHAINS: ChainOption[] = [
  { id: "arc-testnet", label: "Arc Testnet", shortLabel: "Arc", chainId: 5042002, supportsStreaming: true },
  { id: "base-sepolia", label: "Base Sepolia", shortLabel: "Base", chainId: 84532, supportsStreaming: false },
];

export function getEnabledChains(): ChainOption[] {
  return ENABLED_CHAINS;
}

export function getChainOption(networkOrChainId: string | number): ChainOption | undefined {
  return ENABLED_CHAINS.find(
    (c) => c.id === networkOrChainId || c.chainId === networkOrChainId,
  );
}

const SELECTED_NETWORK_KEY = "superpage.selected-network";

/** The default network (also the SSR / first-paint value). */
export function getDefaultNetwork(): string {
  return process.env.NEXT_PUBLIC_X402_CHAIN || "arc-testnet";
}

/**
 * The user's chosen payment chain. Client-only (localStorage); falls back to
 * the default network on the server and on first load.
 */
export function getSelectedNetwork(): string {
  if (typeof window === "undefined") return getDefaultNetwork();
  const stored = window.localStorage.getItem(SELECTED_NETWORK_KEY);
  if (stored && ENABLED_CHAINS.some((c) => c.id === stored)) return stored;
  return getDefaultNetwork();
}

export function setSelectedNetwork(network: string): void {
  if (typeof window === "undefined") return;
  if (!ENABLED_CHAINS.some((c) => c.id === network)) return;
  window.localStorage.setItem(SELECTED_NETWORK_KEY, network);
  window.dispatchEvent(new CustomEvent("superpage:network-changed", { detail: network }));
}

export function getNetwork(): string {
  // Honors the user's selection client-side; the env default elsewhere.
  return getSelectedNetwork();
}

export function getCurrency(): string {
  const network = getNetwork();
  const envCurrency = process.env.NEXT_PUBLIC_X402_CURRENCY;
  if (envCurrency) return envCurrency;
  const chainConfig = CHAIN_DEFAULTS[network];
  return chainConfig?.defaultCurrency || "USDC";
}

export function getCurrencyDisplay(): string {
  const currency = getCurrency();
  const network = getNetwork();
  const chainConfig = CHAIN_DEFAULTS[network];
  if (chainConfig?.displayCurrency && currency === "USDC") return chainConfig.displayCurrency;
  if (currency === "BTC") return NATIVE_TOKENS[network] || currency;
  return currency;
}

export function getChainId(): number {
  const network = getNetwork();
  return CHAIN_IDS[network] || 5042002; // Default to Arc testnet
}

export function getNativeToken(): string {
  const network = getNetwork();
  return NATIVE_TOKENS[network] || "USDC";
}

export function isTestnet(): boolean {
  return getNetwork() !== "mezo";
}

export function getSupportedNetworks(): string[] {
  return Object.keys(CHAIN_DEFAULTS);
}

export function getExplorerUrl(): string {
  const network = getNetwork();
  return EXPLORER_URLS[network] || "https://testnet.arcscan.app";
}

export function getTxUrl(txHash: string): string {
  return `${getExplorerUrl()}/tx/${txHash}`;
}

export function getAddressUrl(address: string): string {
  return `${getExplorerUrl()}/address/${address}`;
}

export function getPaymentTokenAddress(): `0x${string}` {
  const network = getNetwork();
  return PAYMENT_TOKEN_ADDRESSES[network] || PAYMENT_TOKEN_ADDRESSES["arc-testnet"];
}

export function getPaymentTokenDecimals(): number {
  const network = getNetwork();
  return PAYMENT_TOKEN_DECIMALS[network] ?? 6;
}

/** @deprecated use getPaymentTokenAddress() */
export function getMusdAddress(): `0x${string}` {
  return getPaymentTokenAddress();
}
