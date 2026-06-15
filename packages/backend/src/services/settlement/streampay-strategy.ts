/**
 * StreamPay settlement strategy: close the on-chain payment channel with the
 * latest voucher. Available on any chain where the StreamPay contract is
 * deployed and an operator key is configured (today: Arc, where USDC is the
 * native gas token). This is the default/fallback mechanism.
 */
import { STREAMPULL_ADDRESS, STREAMPULL_ABI, isStreamPullDeployed } from "../../config/streampull.js";
import type { IStreamSession } from "../../models/StreamSession.js";
import type { SettlementStrategy, SettlementOutcome } from "./types.js";
import { settlementPublicClient, getOperatorWalletClient } from "./context.js";

export const streamPayStrategy: SettlementStrategy = {
  name: "streampay",

  isAvailable(): boolean {
    return isStreamPullDeployed() && getOperatorWalletClient() !== null;
  },

  async settle(session: IStreamSession): Promise<SettlementOutcome> {
    const amount = BigInt(session.lastAmountWei || "0");
    if (amount <= 0n || !session.lastSig) {
      return { settled: false, reason: "no voucher to close against" };
    }

    const walletClient = getOperatorWalletClient();
    if (!walletClient) return { settled: false, reason: "no operator key" };

    // Throws on revert so the orchestrator applies its retry/expire policy.
    const hash = await walletClient.writeContract({
      address: STREAMPULL_ADDRESS,
      abi: STREAMPULL_ABI,
      functionName: "closeSession",
      args: [BigInt(session.sessionId), amount, session.lastSig as `0x${string}`],
      chain: walletClient.chain,
      account: walletClient.account!,
    });

    const receipt = await settlementPublicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`closeSession reverted: ${hash}`);
    }
    return { settled: true, txHash: hash };
  },
};
