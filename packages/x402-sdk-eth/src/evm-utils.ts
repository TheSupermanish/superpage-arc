import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  Address,
  Hash,
  PublicClient,
  WalletClient,
  Chain,
  Account,
  Transport,
  defineChain,
} from "viem";

/**
 * Mezo Mainnet chain definition
 * Chain ID: 31612
 * RPC: https://mezo.drpc.org
 * Native gas token: BTC (18 decimals)
 */
export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  network: "mezo",
  nativeCurrency: {
    decimals: 18,
    name: "Bitcoin",
    symbol: "BTC",
  },
  rpcUrls: {
    default: { http: ["https://mezo.drpc.org"] },
    public: { http: ["https://mezo.drpc.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" },
  },
  testnet: false,
});

/**
 * Mezo Testnet (matsnet) chain definition
 * Chain ID: 31611
 * RPC: https://rpc.test.mezo.org
 * Native gas token: BTC (18 decimals)
 */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet (matsnet)",
  network: "mezo-testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Bitcoin",
    symbol: "BTC",
  },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
    public: { http: ["https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});
import {
  Network,
  TokenType,
  PaymentRequirements,
  TransactionFailedError,
  TransactionStatus,
} from "./x402-types";

/**
 * Chain configurations
 */
export const CHAINS: Record<Network, Chain> = {
  mezo: mezoMainnet,
  "mezo-testnet": mezoTestnet,
};

/**
 * Chain IDs
 */
export const CHAIN_IDS: Record<Network, number> = {
  mezo: 31612,
  "mezo-testnet": 31611,
};

/**
 * Token contract addresses on Mezo.
 * Native gas token: BTC (18 dec) — not an ERC-20, excluded from this map.
 * MUSD is Mezo's BTC-backed stablecoin (ERC20Permit, 18 dec) and the default x402 payment token.
 */
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

export const TOKEN_ADDRESSES: Record<Network, Record<Exclude<TokenType, "BTC">, Address>> = {
  mezo: {
    MUSD: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186" as Address, // MUSD (18 dec)
    USDC: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197" as Address, // mUSDC (Mezo Circle USDC, 6 dec)
    USDT: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E" as Address, // mUSDT (Mezo Tether, 6 dec)
    DAI: "0x1531b6e3d51BF80f634957dF81A990B92dA4b154" as Address,  // mDAI (Mezo DAI, 18 dec)
  },
  "mezo-testnet": {
    MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as Address, // matsnet MUSD (18 dec)
    // SuperPage MockUSDC deployed on matsnet (6 decimals, mintable, for testing the faucet)
    USDC: "0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c" as Address,
    USDT: ZERO_ADDR,
    DAI: ZERO_ADDR,
  },
};

/**
 * Token decimals
 */
export const TOKEN_DECIMALS: Record<TokenType, number> = {
  BTC: 18, // Mezo native gas (18 dec on Mezo, not 8 like real BTC)
  MUSD: 18, // Mezo USD stablecoin (verified on-chain: 18 decimals)
  USDC: 6,
  USDT: 6,
  DAI: 18,
};

/**
 * ERC20 ABI for transfer function
 */
export const ERC20_ABI = [
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
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Get RPC endpoint for network
 */
export function getRpcEndpoint(network: Network, customEndpoint?: string): string {
  if (customEndpoint) return customEndpoint;
  
  // Default public RPCs (recommend using your own in production)
  const publicRpcs: Record<Network, string> = {
    mezo: "https://mezo.drpc.org",
    "mezo-testnet": "https://rpc.test.mezo.org",
  };

  return publicRpcs[network];
}

/**
 * Get chain ID for network
 */
export function getChainId(network: Network): number {
  return CHAIN_IDS[network];
}

/**
 * Create a public client for reading blockchain data
 * Matches Solana SDK's createConnection
 */
export function createConnection(
  network: Network,
  customEndpoint?: string
): PublicClient {
  const endpoint = getRpcEndpoint(network, customEndpoint);
  const chain = CHAINS[network];
  
  return createPublicClient({
    chain,
    transport: http(endpoint),
  });
}

/**
 * Alias for createConnection (for those familiar with viem)
 */
export const createPublicClientForNetwork = createConnection;

/**
 * Create a wallet client for signing transactions
 */
export function createWalletClientForNetwork(
  network: Network,
  account: Account,
  customEndpoint?: string
): WalletClient<Transport, Chain, Account> {
  const endpoint = getRpcEndpoint(network, customEndpoint);
  const chain = CHAINS[network];
  
  return createWalletClient({
    account,
    chain,
    transport: http(endpoint),
  });
}

/**
 * Convert amount string to base units (wei or token base units)
 */
export function amountToBaseUnits(amount: string, token: TokenType): bigint {
  const decimals = TOKEN_DECIMALS[token];
  return parseUnits(amount, decimals);
}

/**
 * Convert base units to display amount
 */
export function baseUnitsToAmount(baseUnits: bigint, token: TokenType): string {
  const decimals = TOKEN_DECIMALS[token];
  return formatUnits(baseUnits, decimals);
}

/**
 * Transaction request type for ETH payments
 */
export interface ETHTransactionRequest {
  to: Address;
  value: bigint;
  data?: `0x${string}`;
}

/**
 * Transaction request type for ERC20 payments
 */
export interface TokenTransactionRequest {
  to: Address; // Token contract address
  data: `0x${string}`; // Encoded transfer call
  value?: bigint;
}

/**
 * Create ETH payment transaction (unsigned)
 * Matches Solana SDK's createSOLPaymentTransaction
 */
export function createETHPaymentTransaction(
  recipient: Address,
  amount: bigint
): ETHTransactionRequest {
  return {
    to: recipient,
    value: amount,
  };
}

/**
 * Create ERC20 token payment transaction (unsigned)
 * Matches Solana SDK's createTokenPaymentTransaction
 */
export function createTokenPaymentTransaction(
  tokenAddress: Address,
  recipient: Address,
  amount: bigint
): TokenTransactionRequest {
  // Encode ERC20 transfer function call
  // transfer(address,uint256) selector: 0xa9059cbb
  const selector = "0xa9059cbb";
  const paddedRecipient = recipient.slice(2).padStart(64, "0");
  const paddedAmount = amount.toString(16).padStart(64, "0");
  const data = `${selector}${paddedRecipient}${paddedAmount}` as `0x${string}`;
  
  return {
    to: tokenAddress,
    data,
    value: 0n,
  };
}

/**
 * Create payment transaction based on requirements (unsigned)
 * Matches Solana SDK's createPaymentTransaction
 */
export function createPaymentTransaction(
  requirements: PaymentRequirements
): ETHTransactionRequest | TokenTransactionRequest {
  const recipient = requirements.recipient as Address;
  const amount = BigInt(requirements.amount);
  
  // Native gas token (BTC on Mezo)
  if (requirements.token === "BTC") {
    return createETHPaymentTransaction(recipient, amount);
  } else {
    const tokenAddress = TOKEN_ADDRESSES[requirements.network][requirements.token as Exclude<TokenType, "BTC">];
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      throw new TransactionFailedError(
        `Token ${requirements.token} is not supported on ${requirements.network}`
      );
    }
    return createTokenPaymentTransaction(tokenAddress, recipient, amount);
  }
}

/**
 * Sign and send a transaction
 * Matches Solana SDK's signAndSendTransaction
 */
export async function signAndSendTransaction(
  walletClient: WalletClient<Transport, Chain, Account>,
  transaction: ETHTransactionRequest | TokenTransactionRequest
): Promise<Hash> {
  try {
    const hash = await walletClient.sendTransaction({
      to: transaction.to,
      value: transaction.value || 0n,
      data: 'data' in transaction ? transaction.data : undefined,
    });
    
    return hash;
  } catch (error) {
    throw new TransactionFailedError(
      `Failed to send transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
      error
    );
  }
}

/**
 * Confirm transaction (wait for receipt)
 * Matches Solana SDK's confirmTransaction
 */
export async function confirmTransaction(
  publicClient: PublicClient,
  hash: Hash,
  confirmations: number = 1
): Promise<boolean> {
  return waitForTransaction(publicClient, hash, confirmations);
}

/**
 * Send ETH payment
 */
export async function sendETHPayment(
  walletClient: WalletClient<Transport, Chain, Account>,
  recipient: Address,
  amount: bigint
): Promise<Hash> {
  const tx = createETHPaymentTransaction(recipient, amount);
  return signAndSendTransaction(walletClient, tx);
}

/**
 * Send ERC20 token payment (with simulation)
 */
export async function sendTokenPayment(
  walletClient: WalletClient<Transport, Chain, Account>,
  publicClient: PublicClient,
  tokenAddress: Address,
  recipient: Address,
  amount: bigint
): Promise<Hash> {
  try {
    // Simulate the transaction first for better error messages
    const { request } = await publicClient.simulateContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, amount],
      account: walletClient.account,
    });
    
    // Send the transaction
    const hash = await walletClient.writeContract(request);
    
    return hash;
  } catch (error) {
    throw new TransactionFailedError(
      `Failed to send token: ${error instanceof Error ? error.message : "Unknown error"}`,
      error
    );
  }
}

/**
 * Send ERC20 token payment (raw, without simulation)
 * Uses pre-built transaction request
 */
export async function sendTokenPaymentRaw(
  walletClient: WalletClient<Transport, Chain, Account>,
  tokenAddress: Address,
  recipient: Address,
  amount: bigint
): Promise<Hash> {
  const tx = createTokenPaymentTransaction(tokenAddress, recipient, amount);
  return signAndSendTransaction(walletClient, tx);
}

/**
 * Create and send payment transaction based on requirements
 * High-level helper that combines transaction creation and sending
 */
export async function sendPaymentTransaction(
  walletClient: WalletClient<Transport, Chain, Account>,
  publicClient: PublicClient,
  requirements: PaymentRequirements
): Promise<Hash> {
  const recipient = requirements.recipient as Address;
  const amount = BigInt(requirements.amount);
  
  // Native gas token (BTC on Mezo)
  if (requirements.token === "BTC") {
    return sendETHPayment(walletClient, recipient, amount);
  } else {
    const tokenAddress = TOKEN_ADDRESSES[requirements.network][requirements.token as Exclude<TokenType, "BTC">];
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      throw new TransactionFailedError(
        `Token ${requirements.token} is not supported on ${requirements.network}`
      );
    }
    return sendTokenPayment(walletClient, publicClient, tokenAddress, recipient, amount);
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  publicClient: PublicClient,
  hash: Hash,
  confirmations: number = 1
): Promise<boolean> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations,
    });
    
    return receipt.status === "success";
  } catch (error) {
    throw new TransactionFailedError(
      `Failed to confirm transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
      error
    );
  }
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  publicClient: PublicClient,
  hash: Hash
): Promise<TransactionStatus> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    
    if (!receipt) {
      return "pending";
    }
    
    if (receipt.status === "reverted") {
      return "failed";
    }
    
    // Check confirmations
    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    
    if (confirmations >= 12) {
      return "finalized";
    } else if (confirmations >= 1) {
      return "confirmed";
    }
    
    return "pending";
  } catch (error) {
    // Transaction not found yet
    return "pending";
  }
}

/**
 * Verify a payment transaction exists and matches requirements
 * SECURITY CRITICAL: This function validates on-chain payments
 */
export async function verifyPaymentTransaction(
  publicClient: PublicClient,
  hash: Hash,
  requirements: PaymentRequirements,
  confirmations: number = 1
): Promise<boolean> {
  try {
    // Get transaction receipt - retry up to 3 times with delay for pending transactions
    let receipt = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!receipt && attempts < maxAttempts) {
      attempts++;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash });
      } catch (e) {
        console.log(`[verifyPayment] Attempt ${attempts}/${maxAttempts}: Transaction receipt not available yet`);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
      }
    }
    
    if (!receipt) {
      console.error("Transaction not found after retries:", hash);
      return false;
    }
    
    // Check transaction succeeded
    if (receipt.status === "reverted") {
      console.error("Transaction reverted:", hash);
      return false;
    }
    
    // Check confirmations
    const currentBlock = await publicClient.getBlockNumber();
    const txConfirmations = Number(currentBlock) - Number(receipt.blockNumber);
    
    // Handle 0 or negative confirmations — if receipt exists with success status,
    // the transaction was included in a block. On fast chains (Mezo, etc.) or due to
    // RPC sync timing, confirmations may be 0 or negative even though the tx is valid.
    if (txConfirmations < 0) {
      console.warn(`[verifyPayment] Negative confirmations (${txConfirmations}) - RPC sync issue. Transaction has valid receipt, allowing.`);
    } else if (txConfirmations === 0 && receipt.status === "success") {
      console.log(`[verifyPayment] Transaction in current block (0 confirmations) with success status, allowing.`);
    } else if (txConfirmations < confirmations) {
      console.warn(`Transaction has ${txConfirmations} confirmations, need ${confirmations}`);
      return false;
    }
    
    // Get the original transaction
    const tx = await publicClient.getTransaction({ hash });
    
    if (!tx) {
      console.error("Could not fetch transaction details:", hash);
      return false;
    }
    
    const recipient = requirements.recipient.toLowerCase() as Address;
    const expectedAmount = BigInt(requirements.amount);
    
    // Verify native gas token transfers (BTC on Mezo)
    if (requirements.token === "BTC") {
      console.log(`[verifyPaymentTransaction] Verifying native ${requirements.token} transfer`);
      console.log(`[verifyPaymentTransaction] tx.to: ${tx.to}, expected: ${recipient}`);
      console.log(`[verifyPaymentTransaction] tx.value: ${tx.value}, expected: ${expectedAmount}`);
      
      if (!tx.to) {
        console.error("Transaction 'to' field is null - invalid transaction format");
        return false;
      }
      
      if (tx.to.toLowerCase() !== recipient) {
        console.error(`Recipient mismatch: got ${tx.to.toLowerCase()}, expected ${recipient}`);
        return false;
      }
      
      if (tx.value < expectedAmount) {
        console.error(`Insufficient payment: expected ${expectedAmount}, got ${tx.value}`);
        return false;
      }
      
      console.log(`[verifyPaymentTransaction] ✓ Payment verified successfully`);
      return true;
    }
    
    // Verify ERC20 token transfers
    const tokenAddress = TOKEN_ADDRESSES[requirements.network][requirements.token];
    
    if (tx.to?.toLowerCase() !== tokenAddress.toLowerCase()) {
      console.error("Transaction not to token contract");
      return false;
    }
    
    // Parse transfer logs
    const transferLogs = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === tokenAddress.toLowerCase() &&
        log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" // Transfer event signature
    );
    
    for (const log of transferLogs) {
      // Decode log data
      const to = `0x${log.topics[2]?.slice(26)}`.toLowerCase();
      const amount = BigInt(log.data);
      
      if (to === recipient && amount >= expectedAmount) {
        return true;
      }
    }
    
    console.error("No matching transfer found in transaction logs");
    return false;
  } catch (error) {
    console.error("Error verifying payment:", error);
    return false;
  }
}
