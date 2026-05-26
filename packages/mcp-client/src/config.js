/**
 * Configuration and chain definitions for SuperPage x402.
 *
 * Mezo-only — the Bitcoin economic layer (EVM-compatible).
 * Native gas: BTC (18 decimals). Default payment token: MUSD (BTC-backed).
 */

import { parseUnits, formatUnits, defineChain } from "viem";

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN DEFINITIONS — Mezo only
// ═══════════════════════════════════════════════════════════════════════════

export const mezoMainnet = defineChain({
  id: 31612,
  name: 'Mezo',
  network: 'mezo',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mezo.drpc.org'] },
    public: { http: ['https://mezo.drpc.org'] },
  },
  blockExplorers: {
    default: { name: 'Mezo Explorer', url: 'https://explorer.mezo.org' },
  },
});

export const mezoTestnet = defineChain({
  id: 31611,
  name: 'Mezo Testnet (matsnet)',
  network: 'mezo-testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.test.mezo.org'] },
    public: { http: ['https://rpc.test.mezo.org'] },
  },
  blockExplorers: {
    default: { name: 'Mezo Testnet Explorer', url: 'https://explorer.test.mezo.org' },
  },
  testnet: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const SERVER_URL = process.env.SUPERPAGE_SERVER || "http://localhost:3001";
export const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
export const NETWORK = process.env.X402_CHAIN || process.env.ETH_NETWORK || "mezo-testnet";
export const CURRENCY = process.env.X402_CURRENCY || "MUSD";
export const TOKEN_ADDRESS = process.env.X402_TOKEN_ADDRESS || "";
export const TOKEN_DECIMALS = (() => {
  // MockUSDC on matsnet is 6-decimal. MUSD (mainnet + testnet) is 18-decimal.
  const isSixDecimal = (sym) => sym === "USDC";
  if (process.env.X402_TOKEN_DECIMALS) {
    const parsed = parseInt(process.env.X402_TOKEN_DECIMALS, 10);
    if (isNaN(parsed)) {
      console.warn(`Invalid X402_TOKEN_DECIMALS "${process.env.X402_TOKEN_DECIMALS}", falling back to default`);
      return isSixDecimal(CURRENCY) ? 6 : 18;
    }
    return parsed;
  }
  return isSixDecimal(CURRENCY) ? 6 : 18;
})();
export const MAX_AUTO_PAYMENT = parseFloat(process.env.MAX_AUTO_PAYMENT || "10.00");

export const CHAINS = {
  "mezo": mezoMainnet,
  "mezo-testnet": mezoTestnet,
};

// Token contract addresses. MUSD is the on-brand BTC-backed stablecoin;
// MockUSDC is a mintable test ERC-20 on matsnet for convenience.
export const TOKEN_ADDRESSES = {
  mezo: {
    MUSD: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  },
  "mezo-testnet": {
    MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    USDC: "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c",
  },
};

// Resolve token contract address
export function getTokenContract() {
  if (TOKEN_ADDRESS) return TOKEN_ADDRESS;
  const networkTokens = TOKEN_ADDRESSES[NETWORK];
  if (networkTokens && networkTokens[CURRENCY]) {
    return networkTokens[CURRENCY];
  }
  return "0x0000000000000000000000000000000000000000";
}

export const TOKEN_CONTRACT = getTokenContract();

// ERC20 Transfer ABI
export const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
];

// Re-export viem utilities needed by other modules
export { parseUnits, formatUnits };
