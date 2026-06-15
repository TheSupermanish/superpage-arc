/**
 * Circle Gateway settlement strategy: batch a session's owed amount through
 * Circle Gateway instead of closing a StreamPay channel. Available on
 * Circle-supported chains (Arc, Base) when GATEWAY_BATCHING is on. Declines
 * (settled:false) when not live yet, so the orchestrator falls back to StreamPay
 * and nothing is ever marked settled until USDC actually moved.
 */
import { Resource, Creator } from "../../models/index.js";
import { isGatewayEnabled } from "../../config/gateway.js";
import { supportsGateway } from "../../config/chain-config.js";
import { settleBatch } from "../gateway-settlement.js";
import type { IStreamSession } from "../../models/StreamSession.js";
import type { SettlementStrategy, SettlementOutcome } from "./types.js";
import { chainConfig } from "./context.js";

export const gatewayStrategy: SettlementStrategy = {
  name: "gateway",

  isAvailable(): boolean {
    return isGatewayEnabled() && supportsGateway(chainConfig.network);
  },

  async settle(session: IStreamSession): Promise<SettlementOutcome> {
    const resource: any = await Resource.findById(session.resourceId).select("creatorId").lean();
    if (!resource?.creatorId) return { settled: false, reason: "resource/creator not found" };
    const creator: any = await Creator.findById(resource.creatorId).select("walletAddress").lean();
    const creatorAddress = creator?.walletAddress;
    if (!creatorAddress) return { settled: false, reason: "creator has no wallet" };

    const result = await settleBatch([
      { session, creatorAddress: creatorAddress as `0x${string}` },
    ]);

    if (!result.submitted) {
      // Flag on but not live (no deposit / scaffolded / unsigned): defer to the
      // next strategy. The batch plan is logged by settleBatch for visibility.
      return {
        settled: false,
        reason: `gateway not live (${result.reason || "scaffold"}); owed ${result.totalUsdc} USDC`,
      };
    }
    return { settled: true, txHash: result.plans[0]?.mintTxs?.[0] };
  },
};
