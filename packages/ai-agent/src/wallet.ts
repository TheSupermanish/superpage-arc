/**
 * On-chain wallet for making ERC20 payments.
 * Uses viem to interact with Mezo (Bitcoin economic layer).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  defineChain,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AgentConfig } from "./config.js";

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export class Wallet {
  public address: Address;
  public explorerBase: string;
  private account;
  private publicClient;
  private walletClient;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.explorerBase = config.explorerUrl ?? "https://explorer.test.mezo.org";
    this.account = privateKeyToAccount(config.walletPrivateKey);
    this.address = this.account.address;

    const chain = defineChain({
      id: config.chainId,
      name: config.chainName ?? "Mezo Testnet",
      network: config.network,
      nativeCurrency: config.nativeCurrency ?? { decimals: 18, name: "Bitcoin", symbol: "BTC" },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
      blockExplorers: config.explorerUrl ? { default: { name: "Explorer", url: config.explorerUrl } } : undefined,
      testnet: true,
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(config.rpcUrl),
    });
  }

  /** Get USDC balance in human-readable format */
  async getUsdcBalance(): Promise<string> {
    const balance = await this.publicClient.readContract({
      address: this.config.usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.address],
    });
    return formatUnits(balance as bigint, this.config.tokenDecimals);
  }

  /** Transfer the configured token to a recipient. Amount in base units (token-decimals). */
  async transferUsdc(to: Address, amountBaseUnits: string): Promise<Hash> {
    const amount = BigInt(amountBaseUnits);

    // Simulate first for better error messages
    const { request } = await this.publicClient.simulateContract({
      address: this.config.usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amount],
      account: this.account,
    });

    return this.walletClient.writeContract(request);
  }

  /** Wait for a transaction to be confirmed */
  async waitForTx(hash: Hash): Promise<boolean> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 0,
    });
    return receipt.status === "success";
  }

  /** Format base units to display amount */
  formatUsdc(baseUnits: string): string {
    return formatUnits(BigInt(baseUnits), this.config.tokenDecimals);
  }

  /** Sign an arbitrary message with the wallet's private key (EIP-191) */
  async signMessage(message: string): Promise<`0x${string}`> {
    return this.account.signMessage({ message });
  }
}
