import { x402Config } from "./x402-config";
import { Amounts } from "../types";
import { isNativeToken, isValidNetwork, getChainId, getTokenDecimalsForNetwork, DEFAULT_NETWORK, SPAY_SCHEME, type NetworkId, type TokenSymbol } from "../config/chain-config";
import crypto from "crypto";

/**
 * Creates x402 payment requirements for the checkout flow
 */
export function createPaymentRequirements(
  orderIntentId: string,
  amounts: Amounts,
  expiresAt: Date,
  network?: string,
  asset?: string
) {
  const usdAmount = parseFloat(amounts.total);
  const selectedNetwork = network || x402Config.network;
  // Default to MUSD (Mezo's BTC-backed stablecoin, 18 decimals).
  const selectedAsset = asset || "MUSD";
  const chainId = isValidNetwork(selectedNetwork) ? getChainId(selectedNetwork as NetworkId) : 0;

  // Look up decimals from the chain registry. Falls back to 18 for native gas tokens
  // (BTC on Mezo), 18 for MUSD, 6 for USDC/USDT, 18 for DAI.
  const decimals = isValidNetwork(selectedNetwork)
    ? getTokenDecimalsForNetwork(selectedNetwork as NetworkId, selectedAsset as TokenSymbol)
    : (isNativeToken(selectedAsset as TokenSymbol) ? 18 : 6);
  const baseAmount = BigInt(Math.floor(usdAmount * 10 ** decimals)).toString();

  return [
    {
      scheme: SPAY_SCHEME,
      network: selectedNetwork,
      chainId,
      token: selectedAsset,
      amount: baseAmount,
      recipient: x402Config.recipientAddress,
      expiresAt: expiresAt.toISOString(),
      metadata: {
        orderIntentId,
        amounts,
      },
    },
  ];
}

/**
 * Deeply sorts object properties to normalize JSON
 * Ensures consistent hashing regardless of property order
 */
export function deepSortObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepSortObject);
  } else if (obj !== null && typeof obj === "object") {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = deepSortObject(obj[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Validates that request body matches the saved order intent using body hash
 * Prevents "change cart after quote" attacks
 */
export function validateOrderIntentMatch(
  savedIntent: any,
  currentRequest: any
): boolean {
  // Compute hash of current request (excluding orderIntentId)
  const { orderIntentId: _, ...requestWithoutIntentId } = currentRequest;

  // Normalize both objects by sorting properties deeply
  const normalizedRequest = deepSortObject(requestWithoutIntentId);
  const currentBodyHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedRequest))
    .digest("hex");

  // Compare with saved body hash
  return currentBodyHash === savedIntent.body_hash;
}

/**
 * Checks if order intent has expired
 */
export function isOrderIntentExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * Parses X-PAYMENT header (plain JSON, not base64)
 */
export function parsePaymentHeader(headerValue: string): any {
  try {
    const parsed = JSON.parse(headerValue);
    
    // Support both txHash and transactionHash
    if (parsed.txHash && !parsed.transactionHash) {
      parsed.transactionHash = parsed.txHash;
    }
    if (parsed.signature && !parsed.transactionHash) {
      parsed.transactionHash = parsed.signature;
    }
    
    // Add timestamp if not present
    if (!parsed.timestamp) {
      parsed.timestamp = Date.now();
    }
    
    // Add chainId from network if not present - use the chain registry
    if (!parsed.chainId && parsed.network) {
      if (isValidNetwork(parsed.network)) {
        parsed.chainId = getChainId(parsed.network);
      } else {
        // Fallback to configured default network
        parsed.chainId = isValidNetwork(DEFAULT_NETWORK) ? getChainId(DEFAULT_NETWORK) : 0;
      }
    }
    
    return parsed;
  } catch (e) {
    throw new Error("Invalid X-PAYMENT header format");
  }
}

/**
 * Extracts transaction hash from verification response
 */
export function extractTxHashFromVerification(verificationResponse: any): string {
  return (
    verificationResponse.txHash ||
    verificationResponse.transaction_hash ||
    verificationResponse.tx_hash ||
    ""
  );
}
