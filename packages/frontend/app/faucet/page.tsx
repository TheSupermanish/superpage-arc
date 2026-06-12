"use client";

import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { getDefaultChain, getDefaultChainId } from "@/lib/chains";
import { PublicNavbar } from "@/components/public-navbar";
import { Droplets, Wallet, ExternalLink, Copy, Check, RefreshCw } from "lucide-react";
import { getPaymentTokenAddress, getAddressUrl } from "@/lib/chain-config";

const PAYMENT_CHAIN_ID = getDefaultChainId();
const PAYMENT_CHAIN = getDefaultChain();
const USDC_FACADE_ADDRESS = getPaymentTokenAddress();

const CIRCLE_FAUCET_URL = "https://faucet.circle.com";

export default function FaucetPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [copied, setCopied] = useState(false);

  // Native balance: on Arc the gas token IS USDC (18 decimals at the native level)
  const { data: nativeBalance, isLoading: balanceLoading, refetch } = useBalance({
    address,
    chainId: PAYMENT_CHAIN_ID,
  });

  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedBalance = nativeBalance
    ? Number(formatUnits(nativeBalance.value, nativeBalance.decimals)).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      })
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      <div className="max-w-xl mx-auto px-4 pt-28 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="size-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <Droplets className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">USDC Faucet</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Get test USDC on {PAYMENT_CHAIN.name} from the Circle faucet. On Arc, USDC is the
            native gas token, so one faucet drip covers both gas and payments.
          </p>
        </div>

        {/* Main card */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-6">
          {/* Wallet address */}
          <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
            <span className="text-sm text-muted-foreground font-medium">Your Wallet</span>
            {isConnected && address ? (
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-2 font-mono text-sm text-foreground hover:text-primary transition-colors"
              >
                <span className="truncate">{address}</span>
                {copied ? (
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <Copy className="h-4 w-4 flex-shrink-0" />
                )}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">Connect a wallet to see your address</p>
            )}
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted border border-border">
            <span className="text-sm text-muted-foreground font-medium">USDC Balance</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">
                {!isConnected
                  ? "0.00"
                  : balanceLoading
                    ? "Loading..."
                    : formattedBalance !== null
                      ? `${formattedBalance} USDC`
                      : "0.00 USDC"}
              </span>
              {isConnected && (
                <button
                  onClick={() => refetch()}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Refresh balance"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Action button */}
          {!isConnected ? (
            <button
              onClick={() => openConnectModal?.()}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold py-4 transition-all flex items-center justify-center gap-2"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>
          ) : (
            <a
              href={CIRCLE_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold py-4 transition-all flex items-center justify-center gap-2"
            >
              <Droplets className="h-4 w-4" />
              Open Circle Faucet
              <ExternalLink className="h-4 w-4" />
            </a>
          )}

          <p className="text-xs text-muted-foreground">
            Select <span className="font-medium text-foreground">Arc Testnet</span> on the Circle
            faucet and paste your address. Amounts arrive as native USDC, ready to spend on gas
            and x402 payments alike.
          </p>
        </div>

        {/* Info card */}
        <div className="mt-6 rounded-2xl bg-card border border-border p-6 space-y-4">
          <h3 className="text-sm font-bold text-foreground">Network Details</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Network</span>
              <span className="font-medium">{PAYMENT_CHAIN.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Chain ID</span>
              <span className="font-medium">{PAYMENT_CHAIN_ID}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gas Token</span>
              <span className="font-medium text-primary">USDC (native)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment Token</span>
              <span className="font-medium">USDC (ERC-20 facade, 6 decimals)</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">USDC Contract</span>
              <a
                href={getAddressUrl(USDC_FACADE_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {USDC_FACADE_ADDRESS.slice(0, 6)}...{USDC_FACADE_ADDRESS.slice(-4)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
