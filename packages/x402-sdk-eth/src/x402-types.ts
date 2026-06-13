import { z } from "zod";

/**
 * x402 Protocol Type Definitions for Ethereum/EVM
 * Based on Coinbase x402 specification for HTTP 402 Payment Required
 */

// Payment scheme types
// "spay" = SuperPage exact-amount scheme, "exact" = standard x402, "upto" = usage-based billing
export const PaymentSchemeSchema = z.enum(["exact", "spay", "upto"]);
export type PaymentScheme = z.infer<typeof PaymentSchemeSchema>;

// Supported networks — Arc (Circle's stablecoin-native L1) + Base + Mezo.
export const NetworkSchema = z.enum([
  "arc-testnet",   // Arc Testnet (Circle L1, USDC-native gas)
  "base-sepolia",  // Base Sepolia (Circle USDC, ETH gas)
  "mezo",          // Mezo Mainnet
  "mezo-testnet",  // Mezo Testnet (matsnet)
]);
export type Network = z.infer<typeof NetworkSchema>;

// Token types.
// Arc: USDC is native gas (18 dec native) and an ERC-20 facade (6 dec); EURC also available.
// Mezo: BTC native gas (18 dec); MUSD (BTC-backed stablecoin, default), USDC, USDT, DAI.
export const TokenTypeSchema = z.enum(["BTC", "MUSD", "USDC", "EURC", "USDT", "DAI"]);
export type TokenType = z.infer<typeof TokenTypeSchema>;

/**
 * Payment Requirements
 * Sent by server in HTTP 402 response body
 */
export const PaymentRequirementsSchema = z.object({
  // Payment scheme: "exact" = exact amount, "upto" = usage-based billing
  scheme: PaymentSchemeSchema,
  
  // Blockchain network
  network: NetworkSchema,
  
  // Chain ID for EVM networks
  chainId: z.number(),
  
  // Payment details
  amount: z.string(), // Amount in token's smallest unit (wei for ETH, base units for tokens)
  token: TokenTypeSchema,
  recipient: z.string(), // EVM address of payment recipient (0x...)
  
  // Optional metadata
  memo: z.string().optional(), // Transaction data/memo
  deadline: z.number().optional(), // Unix timestamp for payment deadline
  requestId: z.string().optional(), // Unique request identifier
});

export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

/**
 * Payment Proof
 * Sent by client in X-Payment header after payment
 */
export const PaymentProofSchema = z.object({
  // Transaction hash on EVM chain
  transactionHash: z.string(),
  
  // Network where transaction was executed
  network: NetworkSchema,
  
  // Chain ID
  chainId: z.number(),
  
  // Optional: Request ID for correlation
  requestId: z.string().optional(),
  
  // Timestamp when payment was made
  timestamp: z.number(),
});

export type PaymentProof = z.infer<typeof PaymentProofSchema>;

/**
 * x402 Response
 * Full structure of HTTP 402 response
 */
export interface X402Response {
  status: 402;
  headers: {
    "content-type": "application/json";
    "www-authenticate"?: string;
  };
  body: PaymentRequirements;
}

/**
 * Transaction Status
 */
export const TransactionStatusSchema = z.enum([
  "pending",
  "confirmed",
  "finalized",
  "failed"
]);

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

/**
 * SDK Configuration
 */
export const SDKConfigSchema = z.object({
  network: NetworkSchema,
  rpcEndpoint: z.string().url().optional(),
  confirmations: z.number().min(1).optional(),
});

export type SDKConfig = z.infer<typeof SDKConfigSchema>;

/**
 * Error types
 */
export class X402Error extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "X402Error";
  }
}

export class PaymentRequiredError extends X402Error {
  constructor(
    public paymentRequirements: PaymentRequirements,
    message = "Payment required to access this resource"
  ) {
    super(message, "PAYMENT_REQUIRED", paymentRequirements);
    this.name = "PaymentRequiredError";
  }
}

export class TransactionFailedError extends X402Error {
  constructor(message: string, details?: unknown) {
    super(message, "TRANSACTION_FAILED", details);
    this.name = "TransactionFailedError";
  }
}

export class InvalidPaymentProofError extends X402Error {
  constructor(message: string, details?: unknown) {
    super(message, "INVALID_PAYMENT_PROOF", details);
    this.name = "InvalidPaymentProofError";
  }
}
