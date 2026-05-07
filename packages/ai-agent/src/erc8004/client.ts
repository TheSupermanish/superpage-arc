/**
 * ERC-8004 Client for the buyer agent.
 * Uses Mezo Testnet / matsnet (chainId 31611).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
} from "./abis.js";

const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet (matsnet)",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

export const ERC8004_CONTRACTS = {
  identityRegistry:
    "0x92b19730d0b7416f195600489cd9be29e109ebce" as Address,
  reputationRegistry:
    "0x6a81e89fdb563cdf0d21dc2ea5c18ec4020e596f" as Address,
  validationRegistry:
    "0x70d51bafea51fb2f60a06824c1bc5638e36243a1" as Address,
} as const;

const MEZO_RPC = "https://rpc.test.mezo.org";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

export interface AgentInfo {
  agentId: bigint;
  owner: Address;
  agentURI: string;
  agentWallet: Address;
}

export interface ReputationSummary {
  count: number;
  summaryValue: bigint;
  summaryValueDecimals: number;
}

export interface FeedbackEntry {
  clientAddress: Address;
  feedbackIndex: number;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
}

export interface ValidationSummary {
  count: number;
  avgResponse: number;
}

export class ERC8004Client {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  public address: Address;

  constructor(privateKey: `0x${string}`) {
    const account = privateKeyToAccount(privateKey);
    this.address = account.address;

    this.publicClient = createPublicClient({
      chain: mezoTestnet,
      transport: http(MEZO_RPC),
    });

    this.walletClient = createWalletClient({
      account,
      chain: mezoTestnet,
      transport: http(MEZO_RPC),
    });
  }

  /** Register this agent on the Identity Registry */
  async registerAgent(
    agentURI?: string
  ): Promise<{ agentId: bigint; txHash: Hash }> {
    const { request } = await this.publicClient.simulateContract({
      address: ERC8004_CONTRACTS.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "register",
      args: [agentURI || ""],
      account: this.walletClient.account!,
    });

    const txHash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Extract agentId from Registered event
    const registeredLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() ===
        ERC8004_CONTRACTS.identityRegistry.toLowerCase()
    );
    let agentId = BigInt(0);
    if (registeredLog?.topics?.[1]) {
      agentId = BigInt(registeredLog.topics[1]);
    }

    return { agentId, txHash };
  }

  /** Get agent info by ID */
  async getAgentInfo(agentId: bigint): Promise<AgentInfo> {
    const [owner, agentURI, agentWallet] = await Promise.all([
      this.publicClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [agentId],
      }) as Promise<Address>,
      this.publicClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "tokenURI",
        args: [agentId],
      }) as Promise<string>,
      this.publicClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "getAgentWallet",
        args: [agentId],
      }) as Promise<Address>,
    ]);

    return { agentId, owner, agentURI, agentWallet };
  }

  /** Check if an agent ID exists on-chain */
  async isRegistered(agentId: bigint): Promise<boolean> {
    try {
      await this.publicClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [agentId],
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Get reputation summary for an agent */
  async getReputationSummary(agentId: bigint): Promise<ReputationSummary> {
    const result = (await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, [], "", ""],
    })) as [bigint, bigint, number];

    return {
      count: Number(result[0]),
      summaryValue: result[1],
      summaryValueDecimals: result[2],
    };
  }

  /** Get all feedback entries for an agent */
  async getAllFeedback(agentId: bigint): Promise<FeedbackEntry[]> {
    // First get all client addresses
    const clients = (await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getClients",
      args: [agentId],
    })) as Address[];

    if (clients.length === 0) return [];

    const result = (await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "readAllFeedback",
      args: [agentId, clients, "", "", false],
    })) as [Address[], bigint[], bigint[], number[], string[], string[], boolean[]];

    const [
      returnedClients,
      feedbackIndexes,
      values,
      valueDecimals,
      tag1s,
      tag2s,
      revokedStatuses,
    ] = result;

    return returnedClients.map((addr, i) => ({
      clientAddress: addr,
      feedbackIndex: Number(feedbackIndexes[i]),
      value: values[i],
      valueDecimals: valueDecimals[i],
      tag1: tag1s[i],
      tag2: tag2s[i],
      isRevoked: revokedStatuses[i],
    }));
  }

  /** Give feedback to a merchant agent */
  async giveFeedback(
    agentId: bigint,
    value: number,
    tag1 = "",
    tag2 = ""
  ): Promise<Hash> {
    const { request } = await this.publicClient.simulateContract({
      address: ERC8004_CONTRACTS.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "giveFeedback",
      args: [agentId, BigInt(value), 0, tag1, tag2, "", "", ZERO_BYTES32],
      account: this.walletClient.account!,
    });

    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  /** Get validation summary for an agent */
  async getValidationSummary(agentId: bigint): Promise<ValidationSummary> {
    const result = (await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.validationRegistry,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, [], ""],
    })) as [bigint, number];

    return {
      count: Number(result[0]),
      avgResponse: result[1],
    };
  }

  /** Get all validation request hashes for an agent */
  async getValidationHashes(agentId: bigint): Promise<`0x${string}`[]> {
    return (await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.validationRegistry,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: "getAgentValidations",
      args: [agentId],
    })) as `0x${string}`[];
  }

  /** Get validation status by request hash */
  async getValidationStatus(requestHash: `0x${string}`) {
    const result = (await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.validationRegistry,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: "getValidationStatus",
      args: [requestHash],
    })) as [Address, bigint, number, `0x${string}`, string, bigint];

    return {
      validatorAddress: result[0],
      agentId: result[1],
      response: result[2],
      responseHash: result[3],
      tag: result[4],
      lastUpdate: result[5],
    };
  }
}
