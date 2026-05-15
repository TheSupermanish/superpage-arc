"use client";

import { ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { mezoMainnet, mezoTestnet } from "@/lib/chains";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const supportedChains = [
  mezoTestnet, // Default: Mezo Testnet (matsnet) — x402 payment chain
  mezoMainnet, // Mezo Mainnet (Bitcoin economic layer L2)
] as const;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!projectId || projectId === "YOUR_PROJECT_ID") {
  console.error("WalletConnect project ID not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
}

const config = getDefaultConfig({
  appName: "SuperPage",
  projectId: projectId || "YOUR_PROJECT_ID",
  chains: supportedChains,
  ssr: true,
});

interface EthereumWalletProviderProps {
  children: ReactNode;
}

export function EthereumWalletProvider({ children }: EthereumWalletProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#5B8FB9", // SuperPage blue from logo
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
          initialChain={mezoTestnet}
        >
          {mounted ? children : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
