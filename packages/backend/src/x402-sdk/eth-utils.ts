/**
 * Re-export Ethereum utilities from x402-sdk-eth
 * This allows the backend to use the SDK
 */

// Import everything from the built SDK dist folder
import * as ethSdk from "../../../x402-sdk-eth/dist/index.js";

// Re-export what we need
export const createConnection = ethSdk.createConnection;
export const createPublicClientForNetwork = ethSdk.createPublicClientForNetwork;
export const getRpcEndpoint = ethSdk.getRpcEndpoint;
export const getChainId = ethSdk.getChainId;
export const verifyPaymentTransaction = ethSdk.verifyPaymentTransaction;
export const amountToBaseUnits = ethSdk.amountToBaseUnits;
export const baseUnitsToAmount = ethSdk.baseUnitsToAmount;
export const CHAINS = ethSdk.CHAINS;
export const CHAIN_IDS = ethSdk.CHAIN_IDS;
export const TOKEN_ADDRESSES = ethSdk.TOKEN_ADDRESSES;
export const TOKEN_DECIMALS = ethSdk.TOKEN_DECIMALS;
export const PaymentRequirementsSchema = ethSdk.PaymentRequirementsSchema;
export const PaymentProofSchema = ethSdk.PaymentProofSchema;

// Re-export types
export type PaymentRequirements = {
  scheme: "exact" | "spay" | "upto";
  network: string;
  chainId: number;
  amount: string;
  token: "BTC" | "MUSD" | "USDC" | "USDT" | "DAI";
  recipient: string;
  memo?: string;
  deadline?: number;
  requestId?: string;
};

export type PaymentProof = {
  transactionHash: string;
  network: string;
  chainId: number;
  requestId?: string;
  timestamp: number;
};

export type Network = "mezo" | "mezo-testnet";
export type TokenType = "BTC" | "MUSD" | "USDC" | "USDT" | "DAI";
