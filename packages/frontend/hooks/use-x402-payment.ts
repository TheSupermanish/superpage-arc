"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useNetworkSwitch } from "./use-network-switch";
import { createPublicClient, http, parseAbi, type Chain } from "viem";
import { CHAIN_BY_ID, CHAIN_BY_NAME, getDefaultChain } from "@/lib/chains";
import {
  getSelectedNetwork,
  getCurrency,
  PAYMENT_TOKEN_ADDRESSES,
  CHAIN_IDS,
} from "@/lib/chain-config";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// A receipt-polling client for whichever chain the payment settled on.
// Cached so we do not rebuild a client per call.
const receiptClients = new Map<number, ReturnType<typeof createPublicClient>>();
function getReceiptClient(chainId: number) {
  const cached = receiptClients.get(chainId);
  if (cached) return cached;
  const chain: Chain = CHAIN_BY_ID[chainId] || getDefaultChain();
  const client = createPublicClient({ chain, transport: http() });
  receiptClients.set(chainId, client);
  return client;
}

export type PaymentStatus =
  | "idle"
  | "fetching-requirements"
  | "switching-network"
  | "awaiting-approval"
  | "confirming-tx"
  | "verifying-payment"
  | "success"
  | "error";

interface PaymentRequirements {
  scheme: string;
  network: string;
  chainId: number;
  token: string;
  amount: string;
  recipient: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutRequest {
  storeId: string;
  items: Array<{ productId: string; quantity: number }>;
  shippingAddress: {
    name: string;
    address1: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  email: string;
  orderIntentId?: string;
}

export interface ResourceResult {
  content: unknown;
  contentType: string;
  /** Set when the resource was a file download */
  downloaded?: { filename: string; url: string };
}

export interface CheckoutResult {
  orderId: string;
  orderIntentId: string;
  shopifyOrderId: string | null;
  txHash: string;
  amounts: {
    subtotal: string;
    shipping: string;
    tax: string;
    total: string;
    currency: string;
  };
}

/** A completed payment: the tx plus the chain it actually settled on. */
interface PaidResult {
  hash: string;
  network: string;
  chainId: number;
}

function buildPaymentHeader(paid: PaidResult) {
  return JSON.stringify({
    transactionHash: paid.hash,
    network: paid.network,
    chainId: paid.chainId,
    timestamp: Date.now(),
  });
}

/** Try to handle the response as a file download. Returns ResourceResult if it was a file, null otherwise. */
function tryFileDownload(res: Response): ResourceResult | null {
  const cd = res.headers.get("content-disposition");
  if (!cd || !cd.includes("attachment")) return null;

  const filename = cd.match(/filename="(.+?)"/)?.[1] || "download";
  // Return a marker — caller will handle the blob
  return {
    content: { downloaded: true, filename },
    contentType: res.headers.get("content-type") || "application/octet-stream",
    downloaded: { filename, url: "" }, // url filled in after blob
  };
}

/** Create a blob URL from a Response (does NOT auto-download — modal shows download button) */
async function prepareBlobUrl(res: Response): Promise<string> {
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Read response body safely based on content-type (avoids body-already-read errors) */
async function readResponseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

/** Map raw errors to user-friendly messages (chain-aware) */
function friendlyError(err: any): string {
  const chainName = CHAIN_BY_NAME[getSelectedNetwork()]?.name || "the selected network";
  const currency = getCurrency();

  // User rejected in wallet
  if (err.code === 4001 || err.code === "ACTION_REJECTED")
    return "You rejected the transaction in your wallet.";

  // Chain not added to wallet
  if (err.code === 4902)
    return `${chainName} network not found in your wallet. Please add it and try again.`;

  // Explicit message we threw (reverted, network switch, etc.)
  if (err.message?.startsWith("Transaction reverted"))
    return err.message;
  if (err.message?.startsWith("Please switch"))
    return err.message;

  // Wagmi / viem short messages
  const short: string = err.shortMessage || "";
  if (/insufficient funds/i.test(short) || /insufficient funds/i.test(err.message || ""))
    return `Insufficient ${currency} balance. Make sure you have enough tokens on ${chainName}.`;
  if (/user rejected/i.test(short))
    return "You rejected the transaction in your wallet.";
  if (/connector not connected/i.test(short))
    return "Wallet disconnected. Please reconnect and try again.";

  // Network / fetch errors
  if (err.name === "TypeError" && /fetch/i.test(err.message || ""))
    return "Cannot reach the server. Check your connection and try again.";

  // Backend JSON error bodies we parsed
  if (err.message?.includes("Payment verification failed"))
    return "Payment could not be verified on-chain. The transaction may have failed or not yet confirmed.";
  if (err.message?.includes("Resource not found"))
    return "This resource no longer exists or has been removed.";
  if (err.message?.includes("not available"))
    return "This resource is currently unavailable.";
  if (err.message?.includes("Order intent expired"))
    return "Your checkout session expired. Please try again.";
  if (err.message?.includes("already processed"))
    return "This order was already processed.";
  if (err.message?.includes("Unknown storeId") || err.message?.includes("Product not found"))
    return "This product is no longer available.";
  if (err.message?.includes("recipient not configured"))
    return "The seller hasn't configured their wallet yet. Contact the creator.";

  // Fallback
  return err.shortMessage || err.message || "Something went wrong. Please try again.";
}

export function useX402Payment() {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchToChain } = useNetworkSwitch();
  const { writeContractAsync } = useWriteContract();

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  const sendPayment = useCallback(
    async (requirements: PaymentRequirements): Promise<PaidResult> => {
      // Resolve the chain to pay on from the chosen requirement (multichain).
      const reqNetwork = requirements.network || getSelectedNetwork();
      const targetChainId =
        requirements.chainId || CHAIN_IDS[reqNetwork] || CHAIN_IDS[getSelectedNetwork()];
      const chainName = CHAIN_BY_ID[targetChainId]?.name || reqNetwork;

      // Switch the wallet to that chain
      setStatus("switching-network");
      const switched = await switchToChain(targetChainId);
      if (!switched) throw new Error(`Please switch to ${chainName} network`);

      // Token address for the chosen chain. (The 402 sends a token symbol, not
      // an address, so resolve by network; honor an explicit 0x override.)
      const tokenAddr = (requirements.token && requirements.token.startsWith("0x")
        ? (requirements.token as `0x${string}`)
        : undefined) || PAYMENT_TOKEN_ADDRESSES[reqNetwork] || PAYMENT_TOKEN_ADDRESSES[getSelectedNetwork()];

      // Send ERC-20 transfer on the chosen chain
      setStatus("awaiting-approval");
      const hash = await writeContractAsync({
        abi: ERC20_ABI,
        address: tokenAddr,
        functionName: "transfer",
        args: [requirements.recipient as `0x${string}`, BigInt(requirements.amount)],
        chainId: targetChainId,
        gas: 500_000n,
      });

      setTxHash(hash);
      setStatus("confirming-tx");

      // Wait for confirmation on the chain it settled on
      const receipt = await getReceiptClient(targetChainId).waitForTransactionReceipt({ hash, confirmations: 1 });

      if (receipt.status === "reverted") {
        throw new Error(
          `Transaction reverted — you may not have enough ${getCurrency()}. ` +
          "Get test tokens from the faucet."
        );
      }

      return { hash, network: reqNetwork, chainId: targetChainId };
    },
    [switchToChain, writeContractAsync],
  );

  // Flow A: Pay for a resource (API, file, article)
  const payForResource = useCallback(
    async (resourceIdOrSlug: string): Promise<ResourceResult> => {
      if (!isConnected) {
        openConnectModal?.();
        throw new Error("Please connect your wallet first");
      }

      try {
        // Phase 1: Get payment requirements
        setStatus("fetching-requirements");
        setError(null);
        setTxHash(null);

        const walletQuery = address ? `?wallet=${address.toLowerCase()}` : "";
        const phase1 = await fetch(`${API_URL}/x402/resource/${resourceIdOrSlug}${walletQuery}`);
        if (phase1.status !== 402) {
          if (!phase1.ok) {
            const errBody = await readResponseBody(phase1) as any;
            throw new Error(errBody?.error || `Server error (${phase1.status})`);
          }
          // Resource is free or already accessible (previously paid)
          // Check if it's a file download
          const fileInfo = tryFileDownload(phase1);
          if (fileInfo) {
            const blobUrl = await prepareBlobUrl(phase1);
            setStatus("success");
            return { ...fileInfo, downloaded: { ...fileInfo.downloaded!, url: blobUrl } };
          }
          const content = await readResponseBody(phase1);
          setStatus("success");
          return { content, contentType: phase1.headers.get("content-type") || "application/json" };
        }

        const body = await phase1.json();
        // Multichain: prefer the accepts[] entry for the user's selected chain.
        const accepts: PaymentRequirements[] = body.accepts || body.paymentRequirements || [body];
        const selected = getSelectedNetwork();
        const requirements: PaymentRequirements =
          accepts.find((a) => a.network === selected) || accepts[0];

        if (!requirements.recipient || !requirements.amount) {
          throw new Error("Invalid payment requirements from server");
        }

        // Send payment
        const paid = await sendPayment(requirements);

        // Phase 2: Verify payment & get content
        setStatus("verifying-payment");
        const phase2 = await fetch(`${API_URL}/x402/resource/${resourceIdOrSlug}`, {
          headers: { "X-PAYMENT": buildPaymentHeader(paid) },
        });

        if (!phase2.ok) {
          const errBody = await readResponseBody(phase2) as any;
          throw new Error(errBody?.details || errBody?.error || `Verification failed (${phase2.status})`);
        }

        // Check if this is a file download (Content-Disposition: attachment)
        const fileInfo = tryFileDownload(phase2);
        if (fileInfo) {
          const blobUrl = await prepareBlobUrl(phase2);
          setStatus("success");
          return { ...fileInfo, downloaded: { ...fileInfo.downloaded!, url: blobUrl } };
        }

        const content = await readResponseBody(phase2);
        setStatus("success");
        return { content, contentType: phase2.headers.get("content-type") || "application/json" };
      } catch (err: any) {
        setError(friendlyError(err));
        setStatus("error");
        throw err;
      }
    },
    [isConnected, address, openConnectModal, sendPayment],
  );

  // Flow B: Pay for a store product (checkout)
  const payForProduct = useCallback(
    async (checkoutData: CheckoutRequest): Promise<CheckoutResult> => {
      if (!isConnected) {
        openConnectModal?.();
        throw new Error("Please connect your wallet first");
      }

      try {
        setStatus("fetching-requirements");
        setError(null);
        setTxHash(null);

        // Phase 1: Create order intent
        const phase1 = await fetch(`${API_URL}/x402/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checkoutData),
        });

        if (phase1.status !== 402) {
          const errBody = await readResponseBody(phase1) as any;
          throw new Error(errBody?.error || `Unexpected server response (${phase1.status})`);
        }

        const { orderIntentId, amounts, paymentRequirements } = await phase1.json();
        const selected = getSelectedNetwork();
        const requirements: PaymentRequirements =
          (paymentRequirements as PaymentRequirements[]).find((a) => a.network === selected) ||
          paymentRequirements[0];

        if (!requirements?.recipient || !requirements?.amount) {
          throw new Error("Invalid payment requirements from server");
        }

        // Send payment
        const paid = await sendPayment(requirements);

        // Phase 2: Verify payment
        setStatus("verifying-payment");
        const phase2 = await fetch(`${API_URL}/x402/checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": buildPaymentHeader(paid),
          },
          body: JSON.stringify({ ...checkoutData, orderIntentId }),
        });

        if (!phase2.ok) {
          const errBody = await readResponseBody(phase2) as any;
          throw new Error(errBody?.details || errBody?.error || `Verification failed (${phase2.status})`);
        }

        const result = await phase2.json();
        setStatus("success");
        return {
          orderId: result.orderId,
          orderIntentId: result.orderIntentId,
          shopifyOrderId: result.shopifyOrderId || null,
          txHash: paid.hash,
          amounts: result.amounts || amounts,
        };
      } catch (err: any) {
        setError(friendlyError(err));
        setStatus("error");
        throw err;
      }
    },
    [isConnected, openConnectModal, sendPayment],
  );

  return {
    payForResource,
    payForProduct,
    status,
    error,
    txHash,
    reset,
  };
}
