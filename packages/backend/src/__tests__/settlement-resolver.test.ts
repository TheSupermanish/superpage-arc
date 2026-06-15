import { describe, it, expect } from "vitest";
import { resolveSettlementStrategies } from "../services/settlement/resolver.js";
import type { SettlementStrategy } from "../services/settlement/types.js";
import { supportsGateway, supportsStreaming } from "../config/chain-config.js";

function strat(name: string, available: boolean): SettlementStrategy {
  return {
    name,
    isAvailable: () => available,
    async settle() {
      return { settled: false };
    },
  };
}

describe("resolveSettlementStrategies", () => {
  it("keeps only available strategies, preserving preference order", () => {
    const gateway = strat("gateway", true);
    const streampay = strat("streampay", true);
    const resolved = resolveSettlementStrategies([gateway, streampay]);
    expect(resolved.map((s) => s.name)).toEqual(["gateway", "streampay"]);
  });

  it("drops an unavailable preferred strategy and falls back", () => {
    const gateway = strat("gateway", false); // e.g. GATEWAY_BATCHING off
    const streampay = strat("streampay", true);
    const resolved = resolveSettlementStrategies([gateway, streampay]);
    expect(resolved.map((s) => s.name)).toEqual(["streampay"]);
  });

  it("returns an empty list when no mechanism is usable", () => {
    const resolved = resolveSettlementStrategies([strat("gateway", false), strat("streampay", false)]);
    expect(resolved).toEqual([]);
  });
});

describe("chain capability flags", () => {
  it("Arc supports both streaming and gateway", () => {
    expect(supportsStreaming("arc-testnet")).toBe(true);
    expect(supportsGateway("arc-testnet")).toBe(true);
  });

  it("Base supports gateway but not the native-USDC streaming channel", () => {
    expect(supportsStreaming("base-sepolia")).toBe(false);
    expect(supportsGateway("base-sepolia")).toBe(true);
  });

  it("Mezo supports neither (x402 one-shot only)", () => {
    expect(supportsStreaming("mezo-testnet")).toBe(false);
    expect(supportsGateway("mezo-testnet")).toBe(false);
  });
});
