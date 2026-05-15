/**
 * Frontend chain configuration — Mezo (Bitcoin economic layer L2).
 */

const CHAIN_DEFAULTS: Record<string, { defaultCurrency: string; displayCurrency?: string }> = {
  "mezo": { defaultCurrency: "MUSD" },
  "mezo-testnet": { defaultCurrency: "MUSD" },
};

const NATIVE_TOKENS: Record<string, string> = {
  "mezo": "BTC",
  "mezo-testnet": "BTC",
};

export const CHAIN_IDS: Record<string, number> = {
  "mezo": 31612,
  "mezo-testnet": 31611,
};

export const EXPLORER_URLS: Record<string, string> = {
  "mezo": "https://explorer.mezo.org",
  "mezo-testnet": "https://explorer.test.mezo.org",
};

// MockUSDC on matsnet (mintable, for the faucet) / bridged mUSDC on Mezo mainnet.
export const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  "mezo": "0x04671C72Aab5AC02A03c1098314b1BB6B560c197",
  "mezo-testnet": "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c",
};

// MUSD (Mezo USD stablecoin) addresses — Mezo's BTC-backed native stablecoin (18 decimals).
export const MUSD_ADDRESSES: Record<string, `0x${string}`> = {
  "mezo": "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  "mezo-testnet": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
};

export function getNetwork(): string {
  return process.env.NEXT_PUBLIC_X402_CHAIN || "mezo-testnet";
}

export function getCurrency(): string {
  const network = getNetwork();
  const envCurrency = process.env.NEXT_PUBLIC_X402_CURRENCY;
  if (envCurrency) return envCurrency;
  const chainConfig = CHAIN_DEFAULTS[network];
  return chainConfig?.defaultCurrency || "MUSD";
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
  return CHAIN_IDS[network] || 31611; // Default to Mezo testnet
}

export function getNativeToken(): string {
  const network = getNetwork();
  return NATIVE_TOKENS[network] || "BTC";
}

export function isTestnet(): boolean {
  return getNetwork() === "mezo-testnet";
}

export function getSupportedNetworks(): string[] {
  return Object.keys(CHAIN_DEFAULTS);
}

export function getExplorerUrl(): string {
  const network = getNetwork();
  return EXPLORER_URLS[network] || "https://explorer.test.mezo.org";
}

export function getTxUrl(txHash: string): string {
  return `${getExplorerUrl()}/tx/${txHash}`;
}

export function getAddressUrl(address: string): string {
  return `${getExplorerUrl()}/address/${address}`;
}

export function getUsdcAddress(): `0x${string}` {
  const network = getNetwork();
  return USDC_ADDRESSES[network] || USDC_ADDRESSES["mezo-testnet"];
}
