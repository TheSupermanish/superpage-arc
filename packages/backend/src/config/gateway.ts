/**
 * Circle Gateway config: nanopayment batching addresses, minimal ABIs, and the
 * GATEWAY_BATCHING feature flag.
 *
 * Circle Gateway batches many signed off-chain USDC authorizations (EIP-3009
 * transferWithAuthorization) into a single on-chain settlement, making sub-cent
 * payments economically viable. SuperPage uses this as an ADDITIVE, opt-in
 * settlement path for streaming: when the flag is off (default), the StreamPay
 * channel path is used unchanged.
 *
 * Addresses below are the Gateway system contracts on Arc testnet (the same
 * GatewayWallet/GatewayMinter addresses are used across EVM testnets). Domains
 * are Circle's CCTP-style domain identifiers, not EVM chain ids.
 *
 * References:
 *   - developers.circle.com/gateway/nanopayments
 *   - developers.circle.com/gateway/references/contract-interfaces-and-events
 *   - github.com/circlefin/arc-nanopayments
 */
import { getChainConfig, type NetworkId } from "./chain-config.js";

// ============================================================
// Gateway system contracts (Arc testnet; shared across EVM testnets)
// ============================================================

/** GatewayWallet: holds deposited USDC and tracks per-depositor balances. */
export const GATEWAY_WALLET_ADDRESS =
  (process.env.GATEWAY_WALLET_ADDRESS ||
    "0x0077777d7EBA4688BDeF3E311b846F25870A19B9") as `0x${string}`;

/** GatewayMinter: settles attested batches on the destination chain. */
export const GATEWAY_MINTER_ADDRESS =
  (process.env.GATEWAY_MINTER_ADDRESS ||
    "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B") as `0x${string}`;

/** Circle Gateway REST API base (testnet). Used for balances + batch submit. */
export const GATEWAY_API_BASE =
  process.env.GATEWAY_API_BASE || "https://gateway-api-testnet.circle.com";

/**
 * Circle domain identifiers (NOT EVM chain ids) for the chains SuperPage uses.
 * Source: developers.circle.com/gateway/references/supported-blockchains
 */
export const GATEWAY_DOMAINS: Partial<Record<NetworkId, number>> = {
  "arc-testnet": 26,
  "base-sepolia": 6,
};

/** Resolve the Circle domain for the active backend network, if supported. */
export function getGatewayDomain(network?: NetworkId): number | null {
  const net = network || (getChainConfig().network as NetworkId);
  return GATEWAY_DOMAINS[net] ?? null;
}

// ============================================================
// Feature flag
// ============================================================

/**
 * GATEWAY_BATCHING gates the entire Gateway settlement path. Default false:
 * with the flag unset, stream settlement is byte-identical to the StreamPay
 * channel close path that shipped before this feature.
 */
export function isGatewayEnabled(): boolean {
  const raw = (process.env.GATEWAY_BATCHING || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

// ============================================================
// Minimal ABIs (only the calls the backend reads/encodes)
// ============================================================

/**
 * GatewayWallet interface, trimmed to the deposit + balance surface used here.
 * Full ABI: developers.circle.com/gateway/references/contract-interfaces-and-events
 */
export const GATEWAY_WALLET_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    // On-chain available balance (Circle also exposes this via /v1/balances,
    // which additionally reflects finality + in-flight transfers).
    type: "function",
    name: "availableBalance",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBalance",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "initiateWithdrawal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "depositor", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * GatewayMinter interface, trimmed to gatewayMint. Settlement is normally done
 * by Circle's forwarder after a batch is submitted; this ABI is here so the
 * settlement path can submit the attestation directly if forwarding is off.
 */
export const GATEWAY_MINTER_ABI = [
  {
    type: "function",
    name: "gatewayMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
