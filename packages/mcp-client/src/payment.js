/**
 * Payment execution logic for SuperPage x402.
 * Handles both native token (ETH/MNT) and ERC20 token transfers.
 */

import {
  CURRENCY,
  TOKEN_CONTRACT,
  ERC20_ABI,
} from "./config.js";
// NOTE: We import wallet/publicClient/walletClient lazily to break the
// circular dependency between wallet.js and payment.js.
// wallet.js imports payment.js (for sendToken -> makePayment),
// so payment.js cannot import wallet.js at the top level.

let _walletModule = null;

async function getWalletModule() {
  if (!_walletModule) {
    _walletModule = await import("./wallet.js");
  }
  return _walletModule;
}

// ═══════════════════════════════════════════════════════════════════════════
// ETHEREUM PAYMENT (Token Transfer)
// ═══════════════════════════════════════════════════════════════════════════

// Explicit gas limit for payments. Mezo's eth_estimateGas is inconsistent and
// has returned values below the ~35k an ERC20 transfer actually needs, producing
// txs the RPC rejects with "missing or invalid parameters". A fixed, generous
// limit removes that dependency (matches the erc8004 writeContract gas bump).
const PAYMENT_GAS_LIMIT = 120000n;
const MAX_SEND_ATTEMPTS = 3;

export async function makePayment(recipientAddress, amountBaseUnits) {
  const { wallet, publicClient, walletClient, log } = await getWalletModule();

  // Ensure recipient is a valid address string
  const recipient = String(recipientAddress).toLowerCase();
  log(`Payment recipient: ${recipient}`);
  log(`Payment amount: ${amountBaseUnits} wei`);

  const isNative =
    TOKEN_CONTRACT === "0x0000000000000000000000000000000000000000" ||
    CURRENCY === "ETH" ||
    CURRENCY === "MNT";

  // Retry the send: each attempt re-fetches nonce + fees, which clears the
  // transient Mezo RPC rejections that otherwise fail an otherwise-valid payment.
  let lastErr;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      let txHash;
      if (isNative) {
        log(`Sending native ${CURRENCY} transfer (attempt ${attempt}/${MAX_SEND_ATTEMPTS})...`);
        txHash = await walletClient.sendTransaction({
          to: recipient,
          value: BigInt(amountBaseUnits),
          gas: PAYMENT_GAS_LIMIT,
        });
      } else {
        log(`Sending ERC20 ${CURRENCY} transfer (attempt ${attempt}/${MAX_SEND_ATTEMPTS})...`);
        txHash = await walletClient.writeContract({
          address: TOKEN_CONTRACT,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipient, BigInt(amountBaseUnits)],
          gas: PAYMENT_GAS_LIMIT,
        });
      }

      log(`Transaction sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      // A revert is deterministic — don't retry it.
      if (receipt.status === "reverted") {
        return { success: false, error: "Transaction reverted" };
      }

      return { success: true, txHash };
    } catch (err) {
      lastErr = err;
      log(`Payment attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_SEND_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  return { success: false, error: lastErr?.message || "Payment failed after retries" };
}
